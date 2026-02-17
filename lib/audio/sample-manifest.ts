/**
 * Sample Manifest - Maps all available sample files for Dubstep and ElectroHouse remixing
 * Maintains the original asset structure from the project
 */

export interface SampleLibrary {
  [key: string]: string;
}

export const DUBSTEP_SAMPLES = {
  // Wub bass sounds - chromatic notes A0-G#1
  wubs: {
    'a': '/samples/dubstep/wubs/a.wav',
    'a-sharp': '/samples/dubstep/wubs/a-sharp.wav',
    'b': '/samples/dubstep/wubs/b.wav',
    'c': '/samples/dubstep/wubs/c.wav',
    'c-sharp': '/samples/dubstep/wubs/c-sharp.wav',
    'd': '/samples/dubstep/wubs/d.wav',
    'd-sharp': '/samples/dubstep/wubs/d-sharp.wav',
    'e': '/samples/dubstep/wubs/e.wav',
    'f': '/samples/dubstep/wubs/f.wav',
    'f-sharp': '/samples/dubstep/wubs/f-sharp.wav',
    'g': '/samples/dubstep/wubs/g.wav',
    'g-sharp': '/samples/dubstep/wubs/g-sharp.wav',
  },
  // Break end cymbal/splash sounds
  breakEnds: {
    'a': '/samples/dubstep/break-ends/a.wav',
    'a-sharp': '/samples/dubstep/break-ends/a-sharp.wav',
    'b': '/samples/dubstep/break-ends/b.wav',
    'c': '/samples/dubstep/break-ends/c.wav',
    'c-sharp': '/samples/dubstep/break-ends/c-sharp.wav',
    'd': '/samples/dubstep/break-ends/d.wav',
    'd-sharp': '/samples/dubstep/break-ends/d-sharp.wav',
    'e': '/samples/dubstep/break-ends/e.wav',
    'f': '/samples/dubstep/break-ends/f.wav',
    'f-sharp': '/samples/dubstep/break-ends/f-sharp.wav',
    'g': '/samples/dubstep/break-ends/g.wav',
    'g-sharp': '/samples/dubstep/break-ends/g-sharp.wav',
  },
  // Splash percussion sounds
  splashes: {
    '1': '/samples/dubstep/splashes/splash_01.wav',
    '2': '/samples/dubstep/splashes/splash_02.wav',
    '3': '/samples/dubstep/splashes/splash_03.wav',
    '4': '/samples/dubstep/splashes/splash_04.wav',
    '5': '/samples/dubstep/splashes/splash_05.wav',
    '6': '/samples/dubstep/splashes/splash_06.wav',
    '7': '/samples/dubstep/splashes/splash_07.wav',
    '8': '/samples/dubstep/splashes/splash_08.wav',
    '9': '/samples/dubstep/splashes/splash_09.wav',
    '10': '/samples/dubstep/splashes/splash_10.wav',
    '11': '/samples/dubstep/splashes/splash_11.wav',
  },
  // Splash end transition sounds
  splashEnds: {
    '1': '/samples/dubstep/splash-ends/1.wav',
    '2': '/samples/dubstep/splash-ends/2.wav',
    '3': '/samples/dubstep/splash-ends/3.wav',
    '4': '/samples/dubstep/splash-ends/4.wav',
  },
  // Hat percussion
  hats: '/samples/dubstep/hats.wav',
  // Intro 8-bar pattern
  introEight: '/samples/dubstep/intro-eight.wav',
};

export const ELECTROHOUSE_SAMPLES = {
  // Synth body sounds - chromatic notes A0-G#1
  body: {
    'a': '/samples/electrohouse/body/a.wav',
    'a-sharp': '/samples/electrohouse/body/a-sharp.wav',
    'b': '/samples/electrohouse/body/b.wav',
    'c': '/samples/electrohouse/body/c.wav',
    'c-sharp': '/samples/electrohouse/body/c-sharp.wav',
    'd': '/samples/electrohouse/body/d.wav',
    'd-sharp': '/samples/electrohouse/body/d-sharp.wav',
    'e': '/samples/electrohouse/body/e.wav',
    'f': '/samples/electrohouse/body/f.wav',
    'f-sharp': '/samples/electrohouse/body/f-sharp.wav',
    'g': '/samples/electrohouse/body/g.wav',
    'g-sharp': '/samples/electrohouse/body/g-sharp.wav',
  },
  // Splash end transition sounds
  splashEnds: {
    '1': '/samples/electrohouse/splash-ends/1.wav',
    '2': '/samples/electrohouse/splash-ends/2.wav',
    '3': '/samples/electrohouse/splash-ends/3.wav',
    '4': '/samples/electrohouse/splash-ends/4.wav',
  },
  // Intro 16-bar pattern
  intro16: '/samples/electrohouse/intro_16.wav',
};

/**
 * Get a chromatic note from the provided sample library
 */
export function getChromaticNote(notes: Record<string, string>, noteIndex: number): string {
  const noteNames = ['a', 'a-sharp', 'b', 'c', 'c-sharp', 'd', 'd-sharp', 'e', 'f', 'f-sharp', 'g', 'g-sharp'];
  const normalizedIndex = ((noteIndex % 12) + 12) % 12;
  return notes[noteNames[normalizedIndex]] || notes['a'];
}

/**
 * Get a random splash from the provided library
 */
export function getRandomSplash(splashes: Record<string, string>): string {
  const keys = Object.keys(splashes);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return splashes[randomKey];
}
