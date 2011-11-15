/*
 * Author: Luis Nabis
 *
 **/

// Cross browser, backward compatible solution
// Original from: https://gist.github.com/1114293#file_anim_loop_x.js
(function(window, Date) {
    // feature testing
    var raf = window.mozRequestAnimationFrame    ||
              window.webkitRequestAnimationFrame ||
              window.msRequestAnimationFrame     ||
              window.oRequestAnimationFrame      ||
              function(loop, element) {
                  // fallback to setTimeout
                  window.setTimeout(loop, 1000 / 60);
              };

    window.animLoop = function(render, element) {
        var running, lastFrame = +new Date;
        function loop(now) {
            if (running !== false) {
                raf(loop, element);

                // Make sure to use a valid time, since:
                // - Chrome 10 doesn't return it at all
                // - setTimeout returns the actual timeout
                now = now && now > 1E4 ? now : +new Date;
                var deltaT = now - lastFrame;
                // do not render frame when deltaT is too high
                if (deltaT < 160) {
                    running = render( deltaT, now );
                }
                lastFrame = now;
            }
        }
        loop();
    };
})(window, Date);


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
        canvasBG = { red: 255, green: 255, blue: 255 },
        spectrum = [];

    var MAX_BEATS = 30,
        COLOR_MAX = 1.5,
        RGB_MAX   = 200.0,
        RGB_MIN   = 20.0;

    var frames          = 0,
        fps_last_update = 0;
        fps             = 0;

    var show_fps = false,
        running  = false;

    function repaint(delta, now) {
        // Clear the canvas before drawing spectrum
//        ctx.clearRect(0,0, canvas.width, canvas.height);

        // Paint the background color
        ctx.fillStyle = 'rgb(' + canvasBG.red + ',' + canvasBG.green + ',' + canvasBG.blue + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Reset the color
        ctx.fillStyle = "rgba(0,0,0,0.2)";

        for (var i = 0, k = 0; k < spectrum.length && i*2 <= canvas.width/2; i++, k = k + 2 ) {
            // multiply spectrum by a zoom value
            magnitude = spectrum[k] * canvas.height * 6.0;

            // Draw rectangle bars for each frequency bin
            var p = i * 2 - 1;
            ctx.fillRect(p, canvas.height/2, 1, -magnitude);
            ctx.fillRect(canvas.width - p, canvas.height/2, 1, -magnitude);

            ctx.fillRect(p, canvas.height/2, 1, magnitude);
            ctx.fillRect(canvas.width - p, canvas.height/2, 1, magnitude);
        }

        // Wash out the background a bit to make it less shocking
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Reset the color
        ctx.fillStyle = "rgb(0,0,0)";

        // FPS Counting
        frames++;

        if (now - fps_last_update > 1000) {
            fps_last_update = now;
            fps = frames;
            frames = 0;
        }

        if (show_fps) {
            // Print the FPS
            ctx.fillText(fps + " fps", 10, 10);
        }

        // TODO: stop this eventually
    }

    function onLoadedMetadata(e) {
        channels          = audioElement[0].mozChannels;
        rate              = audioElement[0].mozSampleRate;
        frameBufferLength = audioElement[0].mozFrameBufferLength;

        fft = new FFT(frameBufferLength / channels, rate);

        audioElement[0].play();

        if (!running) {
            animLoop(repaint, canvas);
            running = true;
        }
    }

    function audioAvailable(event) {
        process(event.frameBuffer, event.time);
    }

    // Inspired by: http://wiki.mozilla.org/Audio_Data_API
    function process(frameBuffer, time) {
        var fb         = frameBuffer,
            signal     = new Float32Array(fb.length / channels),
            magnitude;

        for (var i = 0, fbl = frameBufferLength / 2; i < fbl; i++ ) {
            // Assuming interlaced stereo channels,
            // need to split and merge into a stero-mix mono signal
            signal[i] = (fb[2*i] + fb[2*i+1]) / 2;
        }

        fft.forward(signal);

        spectrum = fft.spectrum;

        var timestamp = time;

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

            calculateBackground(average);
        }
    }

    function calculateBackground(value) {
        var color = {
            red   : -COLOR_MAX + 2.0 * value,
            green :  COLOR_MAX * Math.sin(value),
            blue  :  COLOR_MAX - 2.0 * value
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

        canvasBG = color;
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
            ctx.font = "8px monospace";
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

    function toggleFPS() {
        return (show_fps = !show_fps);
    }

    return {
        fileDrop  : fileDrop,
        drag      : drag,
        toggleFPS : toggleFPS
    };
})();

$.domReady(function() {
    $('html').on('drop', MCG_JS.fileDrop).on('dragenter dragover', MCG_JS.drag);
    // TODO: make this a keyboard changeable option
    MCG_JS.toggleFPS();
});

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s)}(document,'script'));

