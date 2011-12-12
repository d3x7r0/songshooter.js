/*
 * Author: Luis Nabis
 *
 **/

importScripts('libs/dsp.js', 'libs/beatdetektor.js');

var MAX_BEATS      = 30,
    MIN_BEATS      = 5,
    RGB_MAX        = 250.0,
    RGB_MIN        = 120.0,
    MAX_ENEMIES    = 3,
    SPECTRUM_SPLIT = 3;

var idle        = false,
    beats       = 0,
    numBeats    = MAX_BEATS,
    enemies     = [],
    last_update = 0,
    prob        = [],
    audio,
    fft,
    canvasBG    = {
        red   : RGB_MIN,
        green : RGB_MIN,
        blue  : RGB_MIN
    };

var console = (function() {
    return {
        log : function(text) {
            postMessage({
                log : text
            });
        }
    }
})();

function calculateEnemies(color) {
    var numEnemies = 0,
        i          = 1;

    for (var k in color) {
        if (color.hasOwnProperty(k)) {
            var num = prob.length-1,
                found      = false;

            while(num > 0 && !found) {
                if (color[k] > prob[numEnemies]) {
                    found = true;
                } else {
                    num--;
                }
            }

            numEnemies += num/i;

            i = i++;
        }
    }

    return numEnemies;
}

function calculateBackground(spectrum) {
    var color = {
        red   : 0,
        green : 0,
        blue  : 0
    };

    var div = spectrum.length / 3 | 0;

    for (var i = 0; i <= div; i++) {
        color.red   += spectrum[i];
        color.green += spectrum[i + div];
        color.blue  += spectrum[i + 2 * div];
    }

    for (var k in color) {
        if (color.hasOwnProperty(k)) {
            color[k] = color[k] * (RGB_MAX-RGB_MIN) + RGB_MIN | 0;
        }
    }

    return color;
}

function process(data) {
    var response = {};

    // TODO: stop cheating and do an FFT for each channel
    var fb     = data.frameBuffer,
        signal = new Float32Array(fb.length / audio.channels),
        magnitude;

    for (var i = 0, fbl = audio.frameBufferLength / 2; i < fbl; i++ ) {
        // Assuming interlaced stereo channels,
        // need to split and merge into a stero-mix mono signal
        signal[i] = (fb[2*i] + fb[2*i+1]) / 2;
    }

    fft.forward(signal);

    response.spectrum = fft.spectrum;

    last_update += data.time;

    if (last_update > 1.0/30.0) {
        canvasBG          = calculateBackground(fft.spectrum);
        response.canvasBG = canvasBG;
    }

    if (!idle) {
        beats++;

        var numEnemies = calculateEnemies(canvasBG);
        enemies.push(numEnemies);

        console.log(numBeats);
        if (beats == numBeats) {
            numBeats = Math.random()*(MAX_BEATS-MIN_BEATS) + MIN_BEATS | 0;

            response.numEnemies = numEnemies;
            enemies = [];
            beats = 0;
        }
    }


    postMessage(response);
}

function setup(data) {
    idle  = data.idle;
    audio = data.audio;

    fft = new FFT(audio.frameBufferLength / audio.channels, audio.rate);

    for(var i = 0; i <= MAX_ENEMIES; i++) {
        prob[i] = i * (RGB_MAX-RGB_MIN) / MAX_ENEMIES + RGB_MIN;
    }
}

self.onmessage = function(event) {
    if (event.data.setup) {
        setup(event.data);
    } else {
        process(event.data);
    }
};

