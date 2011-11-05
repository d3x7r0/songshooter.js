/*
 * Author: Luis Nabis
 *
 **/

var MCG_JS = (function() {
    var audioElement,
        channels,
        rate,
        frameBufferLength;

    var canvas,
        ctx;

    var bd,
        kick_det,
        vu;

    var ftimer   = 0,
        beats    = [],
        canvasBG = "rgba(255,255,255)";

    var MAX_BEATS = 30,
        COLOR_MAX = 1.5,
        RGB_MAX   = 200.0,
        RGB_MIN   = 20.0;

    function onLoadedMetadata(e) {
        channels          = audioElement[0].mozChannels;
        rate              = audioElement[0].mozSampleRate;
        frameBufferLength = audioElement[0].mozFrameBufferLength;

        fft = new FFT(frameBufferLength / channels, rate);

        audioElement[0].play();
    }

    // Taken from: http://wiki.mozilla.org/Audio_Data_API
    function audioAvailable(event) {
        var fb         = event.frameBuffer,
            signal     = new Float32Array(fb.length / channels),
            magnitude;

        for (var i = 0, fbl = frameBufferLength / 2; i < fbl; i++ ) {
            // Assuming interlaced stereo channels,
            // need to split and merge into a stero-mix mono signal
            signal[i] = (fb[2*i] + fb[2*i+1]) / 2;
        }

        fft.forward(signal);

        // Clear the canvas before drawing spectrum
        ctx.clearRect(0,0, canvas.width, canvas.height);

        // Paint the background color
        ctx.fillStyle = canvasBG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Reset the color
        ctx.fillStyle = "rgba(0,0,0,0.2)";

        for (var i = 0; i < fft.spectrum.length && i*2 <= canvas.width/2; i++ ) {
            // multiply spectrum by a zoom value
            magnitude = fft.spectrum[i] * canvas.height * 6.0;

            // Draw rectangle bars for each frequency bin
            ctx.fillRect(i * 2, canvas.height/2, 1, -magnitude);
            ctx.fillRect(canvas.width - (i * 2), canvas.height/2, 1, -magnitude);

            ctx.fillRect(i * 2, canvas.height/2, 1, magnitude);
            ctx.fillRect(canvas.width - (i * 2), canvas.height/2, 1, magnitude);
        }

        // Wash out the background a bit to make it less shocking
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var timestamp = event.time;

        bd.process(timestamp, fft.spectrum);

        ftimer += bd.last_update;
        if (ftimer > 1.0/30.0) {
            vu.process(bd,ftimer);

            var max = Math.max.apply(Math, vu.vu_levels);

            if (beats.length >= MAX_BEATS) {
                beats.shift();
            }

            beats.push(max);

            var average = 0;
            for(var i = 0; i < beats.length; i++) {
                average += beats[i];
            }
            average = average/beats.length;

            changeBackground(average);
        }
    }

    function changeBackground(value) {
        var color = {
            red   : 0.0,
            green : 0.0,
            blue  : 0.0
        };

        color.red   = -COLOR_MAX + 2.0 * value;
        color.blue  =  COLOR_MAX - 2.0 * value;
        color.green =  COLOR_MAX * Math.sin(value);

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

        canvasBG ='rgb(' + color.red + ', ' + color.green + ', ' + color.blue + ')';
    }

    function setup(file) {
        if (!audioElement) {
            audioElement = $.create('<audio>').css('display', 'none');

            $('#main').append(audioElement);

            audioElement = $(audioElement);
        }

        if (!canvas) {
            canvas = document.getElementById('screen'),
            ctx    = canvas.getContext('2d');
        }

        bd       = new BeatDetektor();
        kick_det = new BeatDetektor.modules.vis.BassKick();
        vu       = new BeatDetektor.modules.vis.VU();

        ftimer   = 0;
        beats    = [];
        canvasBG = "rgba(255,255,255)";

        audioElement.attr('src', file);

        audioElement.on('loadedmetadata', onLoadedMetadata);

        // TODO: add some Web Audio API love here
        audioElement.on('MozAudioAvailable', audioAvailable);

        audioElement[0].load();
    }

    function fileDrop(e) {
        e.stopPropagation();
        e.preventDefault();

        var dt = e.dataTransfer;
        var files = dt.files;

        var uri = window.URL.createObjectURL(dt.files[0]);

        setup(uri);
    }

    function drag(e) {
        e.stopPropagation();
        e.preventDefault();
    }

    return {
        fileDrop : fileDrop,
        drag : drag
    };
})();

$.domReady(function() {
    $('html').on('drop', MCG_JS.fileDrop).on('dragenter dragover', MCG_JS.drag);
});

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s)}(document,'script'));

