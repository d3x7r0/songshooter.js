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

var DKeyboard = (function() {
    var callbacks = {};

    var KEYCODES = {
            BKSP      : 8,
            TAB       : 9,
            ENTER     : 13,
            SHIFT     : 16,
            ALT       : 18,
            PAUSE     : 19,
            CAPS      : 20,
            ESC       : 27,
            SPACE     : 32,
            PGUP      : 33,
            PGDN      : 34,
            HOME      : 36,
            LEFT      : 37,
            UP        : 38,
            RIGHT     : 39,
            DOWN      : 40,
            PRTSC     : 44,
            INS       : 45,
            DEL       : 46
        },
        DEFAULT_THROTTLE_TIME = 500;

    function register(key, callback, opts) {
        var charCode = key;

        opts = opts || {};

        if (charCode.charCodeAt) {
            charCode = charCode.charCodeAt();
        }

        if (!callbacks[charCode]) {
            callbacks[charCode] = [];
        }

        var time = opts.time || DEFAULT_THROTTLE_TIME;

        var cb = callback;
        if (opts.debounce) {
            cb = $.debounce(callback, time);
        } else if(!opts.raw) {
            cb = $.throttle(callback, time);
        }

        callbacks[charCode][callbacks[charCode].length] = {
            callback : cb,
            opts     : opts
        }
    }

    function onKeyPress(e) {
        var cbs = callbacks[e.keyCode];

        if (cbs) {
            $(cbs).each(function(cb) {
                if (cb.opts.shift && !e.shiftKey) {
                    return;
                }

                cb.callback(e);
            });
        }
    }

    (function init() {
        $.domReady(function() {
            $(document).addListener('keypress', onKeyPress);
        });
    })();

    return {
        KEYCODES : KEYCODES,
        register : register
    }
})();

var MCG_JS = (function() {
    var audioElement,
        channels,
        rate,
        frameBufferLength;

    var canvas,
        ctx;

    var bd;

    var ftimer   = 0,
        beats    = [],
        spectrum = [],
        canvasBG = { red: 255, green: 255, blue: 255 };

    var MAX_BEATS = 30,
        COLOR_MAX = 2.5,
        RGB_MAX   = 200.0,
        RGB_MIN   = 30.0;

    var frames          = 0,
        fps_last_update = 0;
        fps             = 0;

    var show_fps = false,
        running  = false;

    function repaint(delta, now) {
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
        if (!running) {
            ctx.clearRect(0,0,canvas.width,canvas.height);
        }
        return running;
    }

    function onLoadedMetadata(e) {
        // TODO: add some Web Audio API love here
        channels          = audioElement[0].mozChannels;
        rate              = audioElement[0].mozSampleRate;
        frameBufferLength = audioElement[0].mozFrameBufferLength;

        fft = new FFT(frameBufferLength / channels, rate);

        audioElement[0].play();

        if (!running) {
            running = true;
            animLoop(repaint, canvas);
        }
    }

    function audioAvailable(event) {
        process(event.frameBuffer, event.time);
    }

    // Inspired by: http://wiki.mozilla.org/Audio_Data_API
    function process(frameBuffer, time) {
        // TODO: stop cheating and do an FFT for each channel
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

        bd.process(time, fft.spectrum);

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

            calculateBackground(average);
        }
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

        canvasBG = color;
    }

    function onAudioEnd(file) {
        running = false;
    }

    function setup(file) {
        if (audioElement) {
            audioElement.remove();
        }

        audioElement = $.create('<audio>').css('display', 'none');

        $('#main').append(audioElement);

        audioElement = $(audioElement);

        if (!canvas) {
            canvas   = document.getElementById('screen'),
            ctx      = canvas.getContext('2d');
            ctx.font = "8px monospace";
        }

        bd = new BeatDetektor();

        ftimer   = 0;
        beats    = [];
        spectrum = [];
        canvasBG = {
            red   : 255,
            green : 255,
            blue  : 255
        };

        for (var i = 0; i < MAX_BEATS; i++) {
            beats[i] = 0;
        }

        audioElement.attr('src', file);

        audioElement.on('loadedmetadata', onLoadedMetadata);
        audioElement.on('ended', onAudioEnd);

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

    (function init() {
        $.domReady(function() {
            $('html').on('drop', MCG_JS.fileDrop).on('dragenter dragover', MCG_JS.drag);
            DKeyboard.register('L', toggleFPS, { shift : true });
        });
    })();

    return {
        fileDrop  : fileDrop,
        drag      : drag,
        toggleFPS : toggleFPS
    };
})();

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s)}(document,'script'));

