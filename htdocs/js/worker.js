/*
 * Author: Luis Nabis
 *
 **/

importScripts('libs/dsp.js', 'libs/beatdetektor.js');

var MAX_BEATS = 30,
    COLOR_MAX = 2.5,
    RGB_MAX   = 250.0,
    RGB_MIN   = 120.0;

var idle = false;

var bd,
    fft;

var ftimer   = 0,
    spectrum = [],
    beats    = [];

var audio;

var MAX_ENEMIES     = 10,
    ENEMIES_AVERAGE = 30;

var values  = [],
    counter = 0;

var prob = [];

function calculateEnemies(average) {
    var numEnemies = prob.length-1,
        found      = false;

    while(numEnemies > 0 && !found) {
        if (average > prob[numEnemies]) {
            found = true;
        } else {
            numEnemies--;
        }
    }

    return numEnemies;
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

function calculateAverage(list, length) {
    var average = 0;

    length = length || list.length;

    for(var i = 0; i < length; i++) {
        average += list[i];
    }

    return average/length;
}

// Inspired by: http://wiki.mozilla.org/Audio_Data_API
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

    bd.process(data.time, fft.spectrum);

    ftimer += bd.last_update;

    var average = 0;

    if (ftimer > 1.0/30.0) {
        var max = Math.max.apply(Math, response.spectrum) * 10.0;

        if (beats.length >= MAX_BEATS) {
            beats.shift();
        }

        beats.push(max);

        average = calculateAverage(beats);

        response.canvasBG = calculateBackground(average);
    }

    if (!idle) {
        counter++;

        var numEnemies = calculateEnemies(average);
        values.push(numEnemies);

        if (counter == ENEMIES_AVERAGE) {
            response.numEnemies = calculateAverage(values) | 0;

            values  = [];
            counter = 0;
        }
    }

    postMessage(response);
}

function setup(data) {
    idle  = data.idle;
    audio = data.audio;

    for (var i = 0; i < MAX_BEATS; i++) {
        beats[i] = 0;
    }

    bd  = new BeatDetektor();
    fft = new FFT(audio.frameBufferLength / audio.channels, audio.rate);

    for (var i = 0; i < MAX_ENEMIES; i++) {
        prob[i] = i * COLOR_MAX / MAX_ENEMIES;
    }
}

self.onmessage = function(event) {
    if (event.data.setup) {
        setup(event.data);
    } else {
        process(event.data);
    }
};

