// src/workers/AudioEngine.js

/**
 * An audio processing engine that provides a common API for audio manipulation.
 * It is designed to use WebGPU when available, with a fallback to CPU-based processing.
 */
export class AudioEngine {
    constructor() {
        this.isGpuAccelerated = false;
        this.gpuDevice = null;
        this.pipelines = {}; // To store compiled WebGPU pipelines

        this.gainShader = `
            @group(0) @binding(0) var<storage, read> inputBuffer: array<f32>;
            @group(0) @binding(1) var<storage, read_write> outputBuffer: array<f32>;
            @group(0) @binding(2) var<uniform> gain: f32;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                let size = arrayLength(&inputBuffer);
                if (index >= size) {
                    return;
                }
                outputBuffer[index] = inputBuffer[index] * gain;
            }
        `;

        this.mixShader = `
            @group(0) @binding(0) var<storage, read> bufferA: array<f32>;
            @group(0) @binding(1) var<storage, read> bufferB: array<f32>;
            @group(0) @binding(2) var<storage, read_write> outputBuffer: array<f32>;
            @group(0) @binding(3) var<uniform> mixRatio: f32;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                let lenA = arrayLength(&bufferA);
                let lenB = arrayLength(&bufferB);

                if (index >= max(lenA, lenB)) {
                    return;
                }

                var sampleA = 0.0;
                if (index < lenA) {
                    sampleA = bufferA[index];
                }

                var sampleB = 0.0;
                if (index < lenB) {
                    sampleB = bufferB[index];
                }

                outputBuffer[index] = mix(sampleA, sampleB, mixRatio);
            }
        `;
    }

    async initialize() {
        if (self.navigator && self.navigator.gpu) {
            try {
                const adapter = await self.navigator.gpu.requestAdapter();
                if (adapter) {
                    this.gpuDevice = await adapter.requestDevice();
                    this.isGpuAccelerated = true;
                    this.pipelines.gain = this.gpuDevice.createComputePipeline({
                        layout: 'auto',
                        compute: { module: this.gpuDevice.createShaderModule({ code: this.gainShader }), entryPoint: 'main' }
                    });
                    this.pipelines.mix = this.gpuDevice.createComputePipeline({
                        layout: 'auto',
                        compute: { module: this.gpuDevice.createShaderModule({ code: this.mixShader }), entryPoint: 'main' }
                    });
                    console.log("AudioEngine: WebGPU backend enabled.");
                    return true;
                }
            } catch (err) {
                console.warn("WebGPU is available but failed to initialize. Falling back to CPU.", err);
                this.isGpuAccelerated = false;
            }
        } else {
            console.log("AudioEngine: WebGPU not available. Using CPU backend.");
        }
        return true;
    }

    async adjustGain(audioBuffer, gain) {
        if (this.isGpuAccelerated) {
            return this.runGpuCompute(this.pipelines.gain, [audioBuffer], { uniform: gain });
        }
        return this.adjustGainCPU(audioBuffer, gain);
    }

    async mix(bufferA, bufferB, mixRatio) {
        if (this.isGpuAccelerated) {
            return this.runGpuCompute(this.pipelines.mix, [bufferA, bufferB], { uniform: mixRatio });
        }
        return this.mixCPU(bufferA, bufferB, mixRatio);
    }

    /**
     * Generic GPU compute runner
     * @private
     */
    async runGpuCompute(pipeline, inputBuffers, options = {}) {
        const device = this.gpuDevice;
        const outputLength = Math.max(...inputBuffers.map(b => b.length));
        const outputBufferSize = outputLength * Float32Array.BYTES_PER_ELEMENT;

        // Create GPU buffers
        const gpuBuffers = inputBuffers.map(buffer => {
            const gpuBuffer = device.createBuffer({
                size: buffer.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new Float32Array(gpuBuffer.getMappedRange()).set(buffer);
            gpuBuffer.unmap();
            return gpuBuffer;
        });

        const outputBuffer = device.createBuffer({
            size: outputBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        const uniformBuffer = device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([options.uniform]));

        // Create bind group
        const entries = gpuBuffers.map((buffer, i) => ({ binding: i, resource: { buffer } }));
        entries.push({ binding: inputBuffers.length, resource: { buffer: outputBuffer } });
        if(options.uniform !== undefined) {
             entries.push({ binding: inputBuffers.length + 1, resource: { buffer: uniformBuffer } });
        }

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });

        // Run compute pass
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(outputLength / 64));
        passEncoder.end();

        // Read back the result
        const readBuffer = device.createBuffer({
            size: outputBufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBufferSize);
        device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();

        // Cleanup
        gpuBuffers.forEach(b => b.destroy());
        outputBuffer.destroy();
        readBuffer.destroy();
        uniformBuffer.destroy();

        return result;
    }

    // --- CPU Implementations ---

    adjustGainCPU(audioBuffer, gain) {
        const outputBuffer = new Float32Array(audioBuffer.length);
        for (let i = 0; i < audioBuffer.length; i++) {
            outputBuffer[i] = audioBuffer[i] * gain;
        }
        return outputBuffer;
    }

    mixCPU(bufferA, bufferB, mixRatio) {
        const length = Math.max(bufferA.length, bufferB.length);
        const outputBuffer = new Float32Array(length);
        const ratioA = 1.0 - mixRatio;

        for (let i = 0; i < length; i++) {
            const sampleA = bufferA[i] || 0;
            const sampleB = bufferB[i] || 0;
            outputBuffer[i] = (sampleA * ratioA) + (sampleB * mixRatio);
        }
        return outputBuffer;
    }
}