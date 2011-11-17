/*
 * Author: Luis Nabis
 *
 **/

importScripts('libs/dsp.js', 'libs/beatdetektor.js');

var MAX_BEATS = 30,
    COLOR_MAX = 2.5,
    RGB_MAX   = 240.0,
    RGB_MIN   = 30.0;

var bd,
    fft;

var ftimer   = 0,
    spectrum = [],
    beats    = [],
    canvasBG = {
        red   : 255,
        green : 255,
        blue  : 255
    };

var audio;

// Inspired by: http://wiki.mozilla.org/Audio_Data_API
function process(data) {
    // TODO: stop cheating and do an FFT for each channel
    var fb         = data.frameBuffer,
        signal     = new Float32Array(fb.length / audio.channels),
        magnitude;

    for (var i = 0, fbl = audio.frameBufferLength / 2; i < fbl; i++ ) {
        // Assuming interlaced stereo channels,
        // need to split and merge into a stero-mix mono signal
        signal[i] = (fb[2*i] + fb[2*i+1]) / 2;
    }

    fft.forward(signal);

    var spectrum = fft.spectrum;

    bd.process(data.time, fft.spectrum);

    ftimer += bd.last_update;
    if (ftimer > 1.0/30.0) {
        var max = Math.max.apply(Math, spectrum) * 10.0;

        beats.shift();
        beats.push(max);

        var average = 0;
        for(var i = 0; i < MAX_BEATS; i++) {
            average += beats[i];
        }
        average = average/MAX_BEATS;

        canvasBG = calculateBackground(average);
    }

    postMessage({
        spectrum : spectrum,
        canvasBG : canvasBG
    });
}

function calculateBackground(value) {
    // TODO: rework the equations to make the COLOR_MAX variable work for the green value
    var color = {
        red   : 2.0 * value - COLOR_MAX,
        green : COLOR_MAX * Math.sin(COLOR_MAX * value - Math.PI/(COLOR_MAX*2)),
        blue  : COLOR_MAX - (COLOR_MAX * 0.5) * value
    };

    for (var k in color) {
        if (color.hasOwnProperty(k)) {
            if (color[k] > COLOR_MAX) {
                color[k] = COLOR_MAX;
            } else if (color[k] < 0.0) {
                color[k] = 0.0;
            }

            color[k] = Math.round(color[k]*(RGB_MAX-RGB_MIN)/COLOR_MAX)+RGB_MIN;
        }
    }

    return color;
}

function setup(data) {
    audio = data.audio;

    for (var i = 0; i < MAX_BEATS; i++) {
        beats[i] = 0;
    }

    bd  = new BeatDetektor();
    fft = new FFT(audio.frameBufferLength / audio.channels, audio.rate);

}

self.onmessage = function(event) {
    if (event.data.setup) {
        setup(event.data);
    } else {
        process(event.data);
    }
}

