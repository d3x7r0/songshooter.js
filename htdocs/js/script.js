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
        canvas,
        canvas_offset;

    var buffer,
        ctx;

    var spectrum = [],
        canvasBG = { red: 255, green: 255, blue: 255 };

    var frames          = 0,
        fps_last_update = 0;
        fps             = 0;

    var show_fps = false,
        running  = false,
        paused   = false;

    var worker = null;

    var RATIO           = 16.0/9.0,
        MAX_RESOLUTION  = 960;

    function repaint(delta, now) {
        if (!running) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            return false;
        }

        // Paint the background color
        ctx.fillStyle = 'rgb(' + canvasBG.red + ',' + canvasBG.green + ',' + canvasBG.blue + ')';
        ctx.fillRect(0, 0, buffer.width, buffer.height);

        // Reset the color
        ctx.fillStyle = "rgba(0,0,0,0.2)";

        for (var i = 0; i < spectrum.length && i*2 <= buffer.width/2; i++) {
            // multiply spectrum by a zoom value
            magnitude = (spectrum[i] * buffer.height * 6.0) | 0;

            // Draw rectangle bars for each frequency bin
            var X      = i * 2 - 1,
                Y      = buffer.height/2 - magnitude,
                height = magnitude * 2;

            ctx.fillRect(X, Y, 1, height);
            ctx.fillRect(buffer.width - X, Y, 1, height);
        }

        // Wash out the background a bit to make it less shocking
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(0, 0, buffer.width, buffer.height);

        paintPlayer(ctx);

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
            ctx.textAlign = "start";
            ctx.font      = "8px monospace";
            ctx.fillText(fps + " fps", 10, 10);
        }

        if (paused) {
            // Print paused if the game is paused
            ctx.textAlign = "center";
            ctx.font      = "16px monospace";
            ctx.fillText("PAUSED", buffer.width/2, buffer.height/2);
        }

        // Copy from the offscreen buffer
        canvas.getContext('2d').drawImage(buffer, 0, 0);
    }

    function paintPlayer(ctx) {
        ctx.fillStyle   = '#000'

        ctx.fillRect(player.x | 0, player.y | 0, 5, 5);
    }

    function onLoadedMetadata(e) {
        // TODO: add some Web Audio API love here
        var data = {
            setup : true,
            audio : {
                channels          : audioElement[0].mozChannels,
                rate              : audioElement[0].mozSampleRate,
                frameBufferLength : audioElement[0].mozFrameBufferLength
            }
        }

        // Start the Worker
        worker.postMessage(data);

        audioElement[0].play();

        running = true;
        animLoop(repaint, canvas);
    }

    function audioAvailable(event) {
        worker.postMessage({
            frameBuffer : event.frameBuffer, 
            time        : event.time
        });
    }

    function onAudioEnd(file) {
        finish();
    }

    function finish() {
        running = false;
        paused  = false;

        $(canvas).css('cursor', '');
        $('#controls .ingame').hide();

        audioElement.remove();

        worker.terminate();
    }

    function onWorkerMessage(event) {
        canvasBG = event.data.canvasBG;
        spectrum = event.data.spectrum;
    }

    function setup(file) {
        if (running) {
            finish();
        }

        audioElement = $.create('<audio>').css('display', 'none');

        $('#main').append(audioElement);

        audioElement = $(audioElement);

        $(canvas).css('cursor', 'none');
        $('#controls .ingame').show();

        worker = new Worker('js/worker.js');
        worker.addEventListener('message', onWorkerMessage);

        // Reset the player position
        resetPlayerPosition();

        // Load the audio file
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

    var player = {
        x : 0,
        y : 0
    }

    function updatePlayerPosition(event) {
        if (!paused) {
            player.x = event.pageX - canvas_offset.left;
            player.y = event.pageY - canvas_offset.top;

            player.x = player.x * canvas.width / $(canvas).width();
            player.y = player.y * canvas.height / $(canvas).height();
        }
    }

    function resetPlayerPosition(event) {
        if (!paused) {
            player.x = 5;
            player.y = canvas.height/2;
        }
    }

    function toggleQuality(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        // Figure out if we're supposed to double or halve the resolution
        var multiplier = (canvas.width != MAX_RESOLUTION) ? 2.0 : 0.5;

        // change the canvas size
        canvas.width  = canvas.width * multiplier;
        canvas.height = canvas.width / RATIO;

        buffer.width  = canvas.width;
        buffer.height = canvas.height;

        // update the player position
        player.x = player.x * multiplier;
        player.y = player.y * multiplier;

        // update the quality indicator text
        updateQualityIndicator('#controls ul .quality');
    }

    function updateQualityIndicator(item) {
        $(item).find('span').text((canvas.width != MAX_RESOLUTION) ? "(low)" : "(high)");
    }

    function togglePause(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        paused = !paused;

        paused ? $('#screen').css('cursor', '') : $('#screen').css('cursor', 'none');
        paused ? audioElement[0].pause() : audioElement[0].play();

        return paused;
    }

    function restart(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        // TODO: clear the score/ships
        audioElement[0].currentTime = 0;
    }

    function abort(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        audioElement[0].pause();
        finish();
    }

    (function init() {
        $.domReady(function() {
            $('html').on('drop', fileDrop).on('dragenter dragover', drag);
            DKeyboard.register('L', toggleFPS, { shift : true });

            canvas        = $('#screen')[0],
            canvas_offset = $(canvas).offset()

            // Create the offscreen buffer
            buffer = document.createElement('canvas'),
            ctx    = buffer.getContext('2d');

            buffer.width  = canvas.width;
            buffer.height = canvas.height;

            $(canvas).mousemove(updatePlayerPosition).mouseleave(resetPlayerPosition);

            $('#controls ul .quality').click(toggleQuality).find('a').append(' <span></span>')
                .each(updateQualityIndicator);

            DKeyboard.register('K', toggleQuality, { shift : true });

            DKeyboard.register(DKeyboard.KEYCODES.PAUSE, togglePause);
            $('#controls ul .pause').click(togglePause);

            $('#controls ul .restart').click(restart);

            $('#controls ul .abort').click(abort);
        });
    })();

    return {
    };
})();

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s)}(document,'script'));

