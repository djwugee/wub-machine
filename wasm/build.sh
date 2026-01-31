#!/bin/bash

# Build Rust WASM module
echo "Building Wub Machine WASM module..."

wasm-pack build --target web --out-dir ../public/wasm --release

if [ $? -eq 0 ]; then
    echo "✓ WASM build successful!"
    echo "Output: public/wasm/"
else
    echo "✗ WASM build failed"
    exit 1
fi
