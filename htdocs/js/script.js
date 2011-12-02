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
        };
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
    };
})();

var MCG_JS = (function() {
    var audioElement,
        canvas,
        canvas_offset;

    var buffer,
        ctx,
        canvas_size;

    var enemySprite,
        playerSprite,
        spriteSize;

    var spectrum = [],
        canvasBG = { red: 255, green: 255, blue: 255 };

    var frames          = 0,
        fps_last_update = 0,
        fps             = 0;

    var show_fps = false,
        running  = false,
        paused   = false;

    var worker = null;

    var RATIO           = 16.0/9.0,
        MAX_RESOLUTION  = 960;

    var DEFAULT_LIFE   = 3,
        PLAYER_SPRITE  = 'img/ship1.svg',
        ENEMY_SPRITE   = 'img/ship2.svg',
        SPRITE_SCALING = 0.25,
        FIRE_RATE      = 100,
        BULLET_SPEED   = 1.05;

    var player,
        enemies,
        bullets;

    var bullets_last_update = 0;

    function paintShips(delta, now) {
        // Reset the color
        ctx.fillStyle = "rgb(0,0,0)";

        // Paint the player
        // Figure out if we're supposed to halve the resolution
        var multiplier = (canvas_size.width != MAX_RESOLUTION) ? 0.5 : 1.0;

        var size = {
            height : playerSprite.height * multiplier * SPRITE_SCALING | 0,
            width  : playerSprite.width  * multiplier * SPRITE_SCALING | 0
        };

        var pos = {
            x : (player.x - size.width/2.0) | 0,
            y : (player.y - size.height/2.0) | 0
        };

        ctx.drawImage(playerSprite, pos.x, pos.y, size.width, size.height);

        // Paint the bullets
        for(var i = 0; i < bullets.length; i++) {
            // TODO: change color and size
            ctx.fillRect(bullets[i].x, bullets[i].y, 5, 5);
        }

        // Paint the enemies
    }

    function paintBackground(delta, now) {
        // Paint the background color
        ctx.fillStyle = 'rgb(' + canvasBG.red + ',' + canvasBG.green + ',' + canvasBG.blue + ')';
        ctx.fillRect(0, 0, canvas_size.width, canvas_size.height);

        // Reset the color
        ctx.fillStyle = "rgba(0,0,0,0.2)";

        for (var i = 0; i < spectrum.length && i*2 <= canvas_size.width/2; i++) {
            // multiply spectrum by a zoom value
            var magnitude = (spectrum[i] * canvas_size.height * 6.0) | 0;

            // Draw rectangle bars for each frequency bin
            var X      = i * 2 - 1,
                Y      = canvas_size.height/2 - magnitude,
                height = magnitude * 2;

            ctx.fillRect(X, Y, 1, height);
            ctx.fillRect(canvas_size.width - X, Y, 1, height);
        }

        // Wash out the background a bit to make it less shocking
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(0, 0, canvas_size.width, canvas_size.height);
    }

    function paintUI(delta, now) {
        if (paused) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(0, 0, canvas_size.width, canvas_size.height);

            // Print paused if the game is paused
            ctx.textAlign = "center";
            ctx.font      = "32px monospace";
            ctx.fillText("PAUSED", canvas_size.width/2, canvas_size.height/2);

            // Reset the color
            ctx.fillStyle = "#000";
        }

        if (show_fps) {
            // Reset the color
            ctx.fillStyle = "rgb(0,0,0)";

            // Print the FPS
            ctx.textAlign = "start";
            ctx.font      = "8px monospace";
            ctx.fillText(fps + " fps", 10, 10);
        }
    }

    function loop(delta, now) {
        if (!running) {
            canvas.getContext('2d').clearRect(0, 0, canvas_size.width, canvas_size.height);
            return false;
        }

        // FPS Counting
        frames++;

        if (now - fps_last_update > 1000) {
            fps_last_update = now;
            fps             = frames;
            frames          = 0;
        }

        // Update bullet position and clean those outside the screen
        var valid_bullets = [];

        for(var i = 0; i < bullets.length; i++) {
            // Update position
            // TODO: use a proper acceleration value
            bullets[i].x = bullets[i].x * BULLET_SPEED;

            // Clean those outside the screen
            if (bullets[i].x <= canvas_size.width) {
                valid_bullets.push(bullets[i]);
            }
        }

        bullets = valid_bullets;

        // Generate new bullet
        if (Date.now() - bullets_last_update > FIRE_RATE) {
            var bullet = {
                x : player.x + spriteSize.width/2,
                y : player.y
            };

            bullets.push(bullet);

            bullets_last_update = Date.now();
        }

        // TODO: Check bullet collisions

        paintBackground(delta, now);
        paintShips(delta, now);
        paintUI(delta, now);

        // Copy from the offscreen buffer
        canvas.getContext('2d').drawImage(buffer, 0, 0);
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
        };

        // Start the Worker
        worker.postMessage(data);

        audioElement[0].play();

        running = true;
        animLoop(loop, canvas);
    }

    function audioAvailable(event) {
        worker.postMessage({
            frameBuffer : event.frameBuffer, 
            time        : event.time
        });
    }

    function updatePlayerPosition(event) {
        if (!paused && running) {
            player.x = event.pageX - canvas_offset.left;
            player.y = event.pageY - canvas_offset.top;

            player.x = player.x * canvas_size.width / $(canvas).width();
            player.y = player.y * canvas_size.height / $(canvas).height();

            // check the bounds
            if (player.x - spriteSize.width/2 < 0) {
                player.x = spriteSize.width/2;
            }

            if (player.x > canvas_size.width - spriteSize.width/2) {
                player.x = canvas_size.width - spriteSize.width/2;
            }

            if (player.y > canvas_size.height - spriteSize.height/2) {
                player.y = canvas_size.height - spriteSize.height/2;
            }

            if (player.y - spriteSize.height/2 < 0) {
                player.y = spriteSize.height/2;
            }
        }
    }

    function resetPlayer() {
        player = {
            x     : 5,
            y     : canvas_size.height/2,
            score : 0,
            life  : DEFAULT_LIFE
        };

        bullets = [];
    }

    function finish() {
        running = false;
        paused  = false;

        $(canvas).css('cursor', '');
        $('#controls .ingame').hide();

        audioElement[0].pause();

        worker.terminate();

        // TODO: save high score
        resetPlayer();

        enemies = [];
        bullets = [];
    }

    function onAudioEnd(file) {
        finish();
    }

    function onWorkerMessage(event) {
        canvasBG = event.data.canvasBG;
        spectrum = event.data.spectrum;
        // TODO: generate the enemies
        console.log(event.data.num_enemies);
    }

    function updateQualityIndicator(item) {
        $(item).find('span').text((canvas_size.width != MAX_RESOLUTION) ? "(low)" : "(high)");
    }

    function updateQuality(multiplier) {
        // change the canvas size
        canvas.width  = canvas.width * multiplier;
        canvas.height = canvas.height * multiplier;

        canvas_size = {
            width  : canvas.width,
            height : canvas.height
        };

        buffer.width  = canvas_size.width;
        buffer.height = canvas_size.height;

        // update the player position
        if (player) {
            player.x = player.x * multiplier;
            player.y = player.y * multiplier;
        }

        // Set the sprites size
        spriteSize = {
            height : playerSprite.height * (1/multiplier) * SPRITE_SCALING | 0,
            width  : playerSprite.width  * (1/multiplier) * SPRITE_SCALING | 0
        };

        // update the quality indicator text
        updateQualityIndicator('#controls ul .quality');
    }

    function toggleQuality(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        // Figure out if we're supposed to double or halve the resolution
        var multiplier = (canvas_size.width != MAX_RESOLUTION) ? 2.0 : 0.5;

        updateQuality(multiplier);
    }

    function setup(file) {
        if (running) {
            finish();
        }

        // Reset the player
        resetPlayer();

        $(canvas).css('cursor', 'none');
        $('#controls .ingame').show();

        // Setup the worker thread
        worker = new Worker('js/worker.js');
        worker.addEventListener('message', onWorkerMessage);

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

    function togglePause(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        paused = !paused;

        if (paused) {
            $('#screen').css('cursor', '');
            audioElement[0].pause();
        } else {
            $('#screen').css('cursor', 'none');
            audioElement[0].play();
        }

        return paused;
    }

    function restart(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        // TODO: clear the score/ships
        resetPlayer();
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

            canvas        = $('#screen')[0];
            canvas_offset = $(canvas).offset();

            // Load the sprites (if it's not loaded)
            playerSprite     = new Image();
            playerSprite.src = PLAYER_SPRITE;

            enemySprite     = new Image();
            enemySprite.src = ENEMY_SPRITE;

            // Create the offscreen buffer
            buffer = document.createElement('canvas');
            ctx    = buffer.getContext('2d');

            // Add the extra markup needed
            $('#controls ul .quality').click(toggleQuality).find('a').append(' <span></span>');


            audioElement = $.create('<audio>').css('display', 'none');

            $('#main').append(audioElement);

            audioElement = $(audioElement);

            // Register the mouse and keyboard listeners
            $(canvas).mousemove(updatePlayerPosition);

            DKeyboard.register('K', toggleQuality, { shift : true });

            DKeyboard.register(DKeyboard.KEYCODES.PAUSE, togglePause);
            $('#controls ul .pause').click(togglePause);

            $('#controls ul .restart').click(restart);

            $('#controls ul .abort').click(abort);

            // Set the render quality to 1.0
            updateQuality(1.0);
        });
    })();

    return {
    };
})();

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s);}(document,'script'));

