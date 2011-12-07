/*
 * Author: Luis Nabis
 *
 **/

// Cross browser, backward compatible solution for requestAnimatonFrame
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

// Keyboard handling abstraction layer
var KeyboardCat = (function() {
    var callbacks        = {},
        callbacksKeyDown = {},
        callbacksKeyUp   = {};

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

        var cbs = callbacks;

        if (opts.keyDown) {
            cbs = callbacksKeyDown;
        } else if (opts.keyUp) {
            cbs = callbacksKeyUp;
        }

        if (!cbs[charCode]) {
            cbs[charCode] = [];
        }

        var time = opts.time || DEFAULT_THROTTLE_TIME;

        var cb = callback;
        if (opts.debounce) {
            cb = $.debounce(callback, time);
        } else if(!opts.raw) {
            cb = $.throttle(callback, time);
        }

        cbs[charCode][cbs[charCode].length] = {
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

    function onKeyDown(e) {
        var cbs = callbacksKeyDown[e.keyCode];

        if (cbs) {
            $(cbs).each(function(cb) {
                if (cb.opts.shift && !e.shiftKey) {
                    return;
                }

                cb.callback(e);
            });
        }
    }

    function onKeyUp(e) {
        var cbs = callbacksKeyUp[e.keyCode];

        if (cbs) {
            $(cbs).each(function(cb) {
                if (cb.opts.shift && !e.shiftKey) {
                    return;
                }

                cb.callback(e);
            });
        }
    }

    function init() {
        $(document).on('keypress', onKeyPress);
        $(document).on('keydown', onKeyDown);
        $(document).on('keyup', onKeyUp);
    }

    $.domReady(init);

    return {
        KEYCODES : KEYCODES,
        register : register
    };
})();

// The physics module
var Newton = (function(){
    function calculateVelocity(velocity, acceleration, delta) {
        return velocity + acceleration * delta;
    }

    function calculatePosition(position, velocity, acceleration, delta) {
        return position + velocity * delta + acceleration * Math.pow(delta, 2.0) / 2.0;
    }

    function move2D(object, delta) {
        var tmp = object;

        if (object.accel.x === 0) {
            tmp.vel.x = tmp.vel.x / 2.0;
        }

        if (object.accel.y === 0) {
            tmp.vel.y = tmp.vel.y / 2.0;
        }

        // Calculate the target speed
        tmp.vel.x = calculateVelocity(object.vel.x, object.accel.x, delta);
        tmp.vel.y = calculateVelocity(object.vel.y, object.accel.y, delta);

        // In case there's a limit cut the acceleration and fix the speed
        if (object.vel.top) {
            var x_mult = (tmp.vel.x >= 0) ? 1.0 : -1.0,
                y_mult = (tmp.vel.y >= 0) ? 1.0 : -1.0;

            if (tmp.vel.x * x_mult > object.vel.top.x) {
                tmp.vel.x   = object.vel.top.x * x_mult;
            }

            if (tmp.vel.y * y_mult > object.vel.top.y) {
                tmp.vel.y   = object.vel.top.y * y_mult;
            }
        }

        // Calculate the new position of the object
        tmp.x = calculatePosition(tmp.x, tmp.vel.x, tmp.accel.x, delta);
        tmp.y = calculatePosition(tmp.y, tmp.vel.y, tmp.accel.y, delta);

        return tmp;
    }

    return {
        move2D : move2D
    };
})();

// The module that prints to the screen
var Picaso = (function(){
    var MAX_RESOLUTION   = 960,
        SPRITE_SCALING   = 0.25,
        FPS_FONT_SIZE    = 16,
        PAUSED_FONT_SIZE = 64;

    var canvas,
        canvasSize,
        ctx;

    var quality = 1.0;

    var paused = false;

    var canvasBG = {
            red   : 0,
            green : 0,
            blue  : 0
        },
        spectrum = [],
        objects  = [];

    var uids = 0;

    var frames        = 0,
        fps           = 0,
        fpsLastUpdate = 0,
        showFps       = false;

    function paintBackground(delta, now) {
        // Paint the background color
        ctx.fillStyle = 'rgb(' + canvasBG.red + ',' + canvasBG.green + ',' + canvasBG.blue + ')';
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        // Wash out the background a bit to make it less shocking
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }

    function paintSpectrum(delta, now) {
        ctx.fillStyle = "rgba(0,0,0,0.2)";

        for (var i = 0; i < spectrum.length && i*2 <= canvasSize.width/2; i++) {
            // multiply spectrum by a zoom value
            var magnitude = (spectrum[i] * canvasSize.height * 6.0);

            // Draw rectangle bars for each frequency bin
            var X      = i * 2 - 1,
                Y      = (canvasSize.height/2.0 - magnitude) | 0,
                height = (magnitude * 2.0) | 0;

            ctx.fillRect(X, Y, 1, height || 1);
            ctx.fillRect(canvasSize.width - X, Y, 1, height || 1);
        }
    }

    function paintUI(delta, now) {
        if (paused) {
            // Print paused if the game is paused
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

            var size = (PAUSED_FONT_SIZE * quality) | 0;

            ctx.textAlign = "center";
            ctx.font      = size + "px monospace";

            ctx.fillText("PAUSED",
                         (canvasSize.width/2) | 0, (canvasSize.height/2 + size/3) | 0);
        }

        if (showFps) {
            // Reset the color
            ctx.fillStyle = "#000";

            // Print the FPS
            var pos = (FPS_FONT_SIZE + 2) * quality | 0;

            ctx.textAlign = "start";
            ctx.font      = ((FPS_FONT_SIZE*quality) | 0) + "px monospace";

            ctx.fillText(fps + " fps", pos/2 | 0, pos);
        }

        // Reset the color
        ctx.fillStyle = "#000";
    }

    function paintObjects(delta, now) {
        // Clear out of bounds objects
        objects = $.reject(objects, function(item) {
            var pos = {
                x : (item.x * quality) | 0,
                y : (item.y * quality) | 0
            };

            var size = item.size;

            if (item.sprite) {
                var sprite = item.sprite;

                size = {
                    height : (sprite.height * quality * SPRITE_SCALING) | 0,
                    width  : (sprite.width  * quality * SPRITE_SCALING) | 0
                };

                pos.x = pos.x - (size.width/2.0 | 0);
                pos.y = pos.y - (size.height/2.0 | 0);
            } else {
                size.height = (size.height * quality) | 0;
                size.width  = (size.width  * quality) | 0;
            }

            var out = {
                x : false,
                y : false
            };

            if (((pos.x + size.width/2.0) | 0) > canvasSize.width) {
                out.x = true;
            }

            if (((pos.y + size.height/2.0) | 0) > canvasSize.height) {
                out.y = true;
            }

            if (pos.x < -(size.width/2.0)) {
                out.x = true;
            }

            if (pos.y < -(size.height/2.0)) {
                out.y = true;
            }

            return (out.x && out.y);
        });

        // Paint the objects
        $(objects).each(function(item, num) {
            var pos = {
                x : (item.x * quality) | 0,
                y : (item.y * quality) | 0
            };

            var size = item.size;

            if (item.sprite) {
                var sprite = item.sprite;

                size = {
                    height : (sprite.height * quality * SPRITE_SCALING) | 0,
                    width  : (sprite.width  * quality * SPRITE_SCALING) | 0
                };

                pos.x = pos.x - (size.width/2.0 | 0);
                pos.y = pos.y - (size.height/2.0 | 0);

                ctx.drawImage(sprite, pos.x, pos.y, size.width, size.height);
            } else {
                size.height = (size.height * 1.0/quality) | 0;
                size.width  = (size.width  * 1.0/quality) | 0;

                pos.x = pos.x - (size.width/2.0 | 0);
                pos.y = pos.y - (size.height/2.0 | 0);

                ctx.fillStyle = item.fillStyle || "rgb(0,0,0)";

                ctx.fillRect(pos.x, pos.y, size.width, size.height);
            }
        });
    }

    function repaint(delta, now) {
        // FPS Counting
        frames++;

        if (now - fpsLastUpdate > 1000) {
            fpsLastUpdate = now;
            fps           = frames;
            frames        = 0;
        }

        // Trigger a tick
        $(Picaso).trigger('tick.picaso', {
            paused : paused,
            delta  : delta,
            now    : now
        });

        // Paint the layers
        paintBackground(delta, now);
        paintSpectrum(delta, now);
        paintObjects(delta, now);
        paintUI(delta, now);
    }

    function updateQualityIndicator(item) {
        $(item).find('span').text((canvasSize.width != MAX_RESOLUTION) ? " (low)" : " (high)");
    }

    function updateQuality(multiplier) {
        quality = quality * multiplier;

        // change the canvas size
        canvas.width  = canvas.width * multiplier;
        canvas.height = canvas.height * multiplier;

        // Cache the canvas size
        canvasSize = {
            width  : canvas.width,
            height : canvas.height
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
        var multiplier = (canvasSize.width != MAX_RESOLUTION) ? 2.0 : 0.5;

        updateQuality(multiplier);
    }

    function toggleFPS() {
        return (showFps = !showFps);
    }

    function pause() {
        paused = true;
    }

    function resume() {
        paused = false;
    }

    function setCanvasBG(color) {
        canvasBG = color;
    }

    function setSpectrumData(data) {
        spectrum = data;
    }

    function removeObject(id) {
        objects = $.reject(objects, function(o) {
            return o.id == this.id;
        }, { id : id });
    }

    function addObject(item) {
        if (!item.id) {
            // use a generated id
            item.id = uids + '-' + (Math.random()*1000 | 0);

            uids++;
        } else {
            removeObject(item.id);
        }

        objects.push(item);

        return item.id;
    }

    function cleanObjects() {
        objects = [];
    }

    function init() {
        canvas = $('#screen')[0];
        ctx    = canvas.getContext('2d');

        // Add the extra markup needed
        $('#controls ul .quality').find('a').click(toggleQuality).append(' <span></span>');

        // Register the keyboard listeners
        KeyboardCat.register('L', toggleFPS, { shift : true });
        KeyboardCat.register('K', toggleQuality, { shift : true, raw : true });

        // Set the render quality to 1.0
        updateQuality(1.0);

        // Start painting
        window.animLoop(repaint, canvas);
    }

    $.domReady(init);

    return {
        SPRITE_SCALING  : SPRITE_SCALING,
        pause           : pause,
        resume          : resume,
        setCanvasBG     : setCanvasBG,
        setSpectrumData : setSpectrumData,
        addObject       : addObject,
        removeObject    : removeObject,
        cleanObjects    : cleanObjects
    };
})();

// The module that manages the audio and the worker thread that analysis it
var AudioProcessor = (function(){
    var IDLE_VOLUME = 0.2;

    var audioElement,
        worker,
        idleSrc = null,
        idle    = false;

    function onWorkerMessage(event) {
        $(AudioProcessor).trigger('spectrum.audio', event.data.spectrum);

        if (event.data.canvasBG) {
            $(AudioProcessor).trigger('canvasbg.audio', event.data.canvasBG);
        }

        if (event.data.numEnemies) {
            $(AudioProcessor).trigger('enemies.audio', event.data.numEnemies);
        }
    }

    function onLoadedMetadata(event) {
        // TODO: add some Web Audio API love here
        var data = {
            setup : true,
            idle  : idle,
            audio : {
                channels          : audioElement.mozChannels,
                rate              : audioElement.mozSampleRate,
                frameBufferLength : audioElement.mozFrameBufferLength
            }
        };

        worker.postMessage(data);

        audioElement.play();
    }

    function onAudioAvailable(event) {
        worker.postMessage({
            frameBuffer : event.frameBuffer,
            time        : event.time
        });
    }

    function start(data) {
        // Start the Worker
        worker = new Worker('js/worker.js');
        worker.addEventListener('message', onWorkerMessage);

        // If there's no song to play then restore the idle song and lower the volume
        if (!data || !data.src) {
            idle = true;
            audioElement.src    = idleSrc;
            audioElement.volume = IDLE_VOLUME;
        } else {
            idle = false;
            audioElement.src    = data.src;
            audioElement.volume = 1;
        }

        // Load the metadata
        audioElement.load();
    }

    function finish(data) {
        // Kill the worker
        worker.terminate();

        // Restore the idle state
        idle = true;

        // Restart the vis
        start(data);
    }

    function onAudioEnd(event) {
        finish();
    }

    function pause() {
        audioElement.pause();
    }

    function resume() {
        audioElement.play();
    }

    function init() {
        audioElement = document.getElementById('music');

        audioElement.addEventListener('loadedmetadata', onLoadedMetadata);
        audioElement.addEventListener('ended', onAudioEnd);

        // TODO: add some Web Audio API love here
        audioElement.addEventListener('MozAudioAvailable', onAudioAvailable);

        idleSrc = audioElement.src;

        start();
    }

    $.domReady(init);

    return {
        start  : finish,
        pause  : pause,
        resume : resume,
        abort  : finish
    };
})();

// The module that oversees the game execution
var Overlord = (function() {
    var FIRE_RATE       = 100,
        BULLET_SPEED    = 1.0/100.0,
        ENEMY_MAX_SPEED = 0.5,
        ENEMY_SPEED     = 0.3,
        ENEMY_ACCEL     = 1.0/10000.0,
        ENEMY_SPRITE    = 'img/ship2.svg';

    var running = false,
        paused  = false;

    var currentFile = null;

    var bullets = [],
        enemies = [],
        player  = {};

    var canvasSize;

    var enemySprite,
        enemySpriteSize,
        spriteScaling = 1;

    var bulletsLastUpdate = 0;

    function setSpriteScaling(scaling) {
        spriteScaling = scaling;

        // Set the sprites size
        enemySpriteSize = {
            height : enemySprite.height * spriteScaling | 0,
            width  : enemySprite.width  * spriteScaling | 0
        };
    }

    function generateEnemies(data) {
        for (var i = 0; i < data; i++) {
            // TODO: prevent enemies from spawning one on top of the other
            var pos = (Math.random() * (canvasSize.height - enemySpriteSize.height)) | 0;

            pos += enemySpriteSize.height/2.0 | 0;

            // TODO: vary the enemies
            var enemy = {
                x : canvasSize.width,
                y : pos,
                sprite : enemySprite,
                vel : {
                    x : -ENEMY_SPEED,
                    y : 0,
                    top : {
                        x : ENEMY_MAX_SPEED,
                        y : ENEMY_MAX_SPEED
                    }
                },
                accel : {
                    x : -ENEMY_ACCEL,
                    y : 0
                }
            };

            // TODO: remove this hard dependency and use an event
            enemy.id = Picaso.addObject(enemy);

            enemies.push(enemy);
        }
    }

    function updateEnemies(delta, now) {
        // Update enemy position and clean those outside the screen
        var validEnemies = [];

        for(var i = 0; i < enemies.length; i++) {
            // Update position
            enemies[i] = Newton.move2D(enemies[i], delta);

            // Clean those outside the screen
            if (enemies[i].x > -enemySpriteSize.width) {
                validEnemies.push(enemies[i]);

                // TODO: remove this hard dependency and use an event
                Picaso.addObject(enemies[i]);
            } else {
                // TODO: remove this hard dependency and use an event
                Picaso.removeObject(enemies[i].id);
            }
        }

        enemies = validEnemies;
    }

    function generateBullets(player, delta, now) {
        // Update bullet position and clean those outside the screen
        var validBullets = [];

        for(var i = 0; i < bullets.length; i++) {
            // Update position
            bullets[i] = Newton.move2D(bullets[i], delta);

            // Clean those outside the screen
            if (bullets[i].x <= canvasSize.width) {
                validBullets.push(bullets[i]);

                // TODO: remove this hard dependency and use an event
                Picaso.addObject(bullets[i]);
            } else {
                // TODO: remove this hard dependency and use an event
                Picaso.removeObject(bullets[i].id);
            }
        }

        bullets = validBullets;

        // Generate new bullet
        // TODO: different types of bullets based on a powerup
        if (now - bulletsLastUpdate > FIRE_RATE) {
            var bullet = {
                x    : player.x + player.size.width/2,
                y    : player.y,
                size : {
                    width  : 5,
                    height : 5
                },
                vel : {
                    x : 0,
                    y : 0
                },
                accel : {
                    x : BULLET_SPEED,
                    y : 0
                }
            };

            // TODO: remove this hard dependency and use an event
            bullet.id = Picaso.addObject(bullet);

            bullets.push(bullet);

            bulletsLastUpdate = Date.now();
        }
    }

    function tock(event) {
        if (running && !paused) {
            updateEnemies(event.delta, event.now);
            generateBullets(player, event.delta, event.now);

            // TODO: check collisions
        }
    }

    function isPaused() {
        return paused;
    }

    function isRunning() {
        return running;
    }

    function togglePause(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (running) {
            paused = !paused;

            if (paused) {
                $(Overlord).trigger('pause.overlord');

                $('#screen').css('cursor', '');
            } else {
                $(Overlord).trigger('resume.overlord');

                $('#screen').css('cursor', 'none');
            }
        }
    }

    function updatePlayer(data) {
        // TODO: figure out why data is empty some times
        player = data;

        var playerObject = {
            id     : 'player-' + data.number,
            x      : data.x,
            y      : data.y,
            sprite : data.sprite
        };

        // TODO: remove this hard dependency and use an event
        Picaso.addObject(playerObject);
    }

    function start(file) {
        running = true;

        bullets = [];
        enemies = [];

        $('#screen').css('cursor', 'none');
        $('#controls .ingame').show();
        $('#start_menu').hide();

        currentFile = file;

        var data = {
            src : file
        };

        $(Overlord).trigger('start.overlord', data);
    }

    function abort(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        running     = false;
        currentFile = null;
        player      = null;

        $('#screen').css('cursor', '');
        $('#controls .ingame').hide();
        $('#start_menu').show();

        $(Overlord).trigger('abort.overlord');
    }

    function restart(event) {
        var file      = currentFile,
            playerTmp = player;

        abort(event);

        start(currentFile = file);

        updatePlayer(playerTmp);
    }

    function fileDrop(e) {
        e.stopPropagation();
        e.preventDefault();

        var dt = e.dataTransfer;
        var files = dt.files;

        var uri = window.URL.createObjectURL(dt.files[0]);

        start(uri);
    }

    function drag(e) {
        e.stopPropagation();
        e.preventDefault();
    }

    function fileOpen(e) {
        if (this.files[0]) {
            var uri = window.URL.createObjectURL(this.files[0]);

            start(uri);
        }
    }

    function filePopup(e) {
        e.preventDefault();
        e.stopPropagation();

        $('#file_form')[0].click();
    }

    function init() {
        // Save the canvas size
        var canvas       = $('#screen');
            canvasSize   = {
            width  : canvas[0].width,
            height : canvas[0].height
        };

        // Load the sprites
        enemySprite     = new Image();
        enemySprite.src = ENEMY_SPRITE;

        // Set the sprites size
        enemySpriteSize = {
            height : enemySprite.height | 0,
            width  : enemySprite.width | 0
        };

        // Register the keyboard listeners
        KeyboardCat.register(KeyboardCat.KEYCODES.PAUSE, togglePause);
        $('#controls ul .pause').click(togglePause);

        $('#controls ul .restart').click(restart);

        $('#controls ul .abort').click(abort);

        $('#start_menu .open').click(filePopup);

        // Register the drag'n'drop listeners
        $('html').on('drop', fileDrop).on('dragenter dragover', drag);

        // Register the file handler
        $('#file_form').on('change', fileOpen);
    }

    $.domReady(init);

    return {
        updatePlayer    : updatePlayer,
        generateEnemies : generateEnemies,
        tock            : tock,
        isPaused        : isPaused,
        isRunning       : isRunning
    };
})();

// The module responsible for controlling the player
var PlayerController = (function() {
    var PLAYER_SPRITE    = 'img/ship1.svg',
        DEFAULT_LIFE     = 3,
        MAX_LIFE         = 10,
        LIFE_CHARACTER   = '&#x2764;',
        PLAYER_ACCEL     = 1.0/1000.0,
        PLAYER_MAX_SPEED = 1.0;

    var playerSprite,
        playerSpriteSize,
        spriteScaling = 1;

    var canvas,
        canvasOffset,
        canvasSize;

    var running = false;

    var player;

    function updateLife() {
        var life = '';

        for(var i = 0; i < player.life; i++) {
            life = life + ' ' + LIFE_CHARACTER;
        }

        $('#controls .life .value').html(life);
    }

    function reset() {
        player = {
            x      : canvasSize.width/2 + 5,
            y      : canvasSize.height/2,
            score  : 0,
            life   : DEFAULT_LIFE,
            sprite : playerSprite,
            size   : playerSpriteSize,
            number : 1,
            accel  : {
                x : 0,
                y : 0
            },
            vel    : {
                x   : 0,
                y   : 0,
                top : {
                    x : PLAYER_MAX_SPEED,
                    y : PLAYER_MAX_SPEED
                }
            }
        };

        updateLife();

        $(PlayerController).trigger('moved.player', player);
    }

    function setSpriteScaling(scaling) {
        spriteScaling = scaling;

        // Set the sprites size
        playerSpriteSize = {
            height : playerSprite.height * spriteScaling | 0,
            width  : playerSprite.width  * spriteScaling | 0
        };

        player.size = playerSpriteSize;
    }

    // TODO: improve the stop functions
    function stopY(event) {
        if (Overlord.isRunning() && !Overlord.isPaused()) {
            player.accel.y = 0;
        }
    }

    function stopX(event) {
        if (Overlord.isRunning() && !Overlord.isPaused()) {
            player.accel.x = 0;
        }
    }

    function checkBounds() {
        // check the bounds
        if (player.x - playerSpriteSize.width/2 < 0) {
            player.x = playerSpriteSize.width/2;

            stopX();
            player.vel.x = 0;
        }

        if (player.x > canvasSize.width - playerSpriteSize.width/2) {
            player.x = canvasSize.width - playerSpriteSize.width/2;

            stopX();
            player.vel.x = 0;
        }

        if (player.y > canvasSize.height - playerSpriteSize.height/2) {
            player.y = canvasSize.height - playerSpriteSize.height/2;

            stopY();
            player.vel.y = 0;
        }

        if (player.y - playerSpriteSize.height/2 < 0) {
            player.y = playerSpriteSize.height/2;

            stopY();
            player.vel.y = 0;
        }
    }

    function updatePosition(event) {
        if (Overlord.isRunning() && !Overlord.isPaused()) {
            player = Newton.move2D(player, event.delta);

            // check the bounds
            checkBounds();

            $(PlayerController).trigger('moved.player', player);
        }
    }

    function moveUp(event) {
        if (Overlord.isRunning() && !Overlord.isPaused() && !player.accel.y) {
            player.accel.y -= PLAYER_ACCEL;
        }
    }

    function moveDown(event) {
        if (Overlord.isRunning() && !Overlord.isPaused() && !player.accel.y) {
            player.accel.y += PLAYER_ACCEL;
        }
    }

    function moveLeft(event) {
        if (Overlord.isRunning() && !Overlord.isPaused() && !player.accel.x) {
            player.accel.x -= PLAYER_ACCEL;
        }
    }

    function moveRight(event) {
        if (Overlord.isRunning() && !Overlord.isPaused() && !player.accel.x) {
            player.accel.x += PLAYER_ACCEL;
        }
    }

    function hit() {
        player.life--;

        if (player.life <= 0) {
            $(PlayerController).trigger('died.player', player);
        }

        $(PlayerController).trigger('life.player', player);
    }

    function score(value) {
        if (value > 0) {
            player.score += value;
        }
    }

    function init() {
        // Load the sprites
        playerSprite     = new Image();
        playerSprite.src = PLAYER_SPRITE;

        // Set the sprites size
        playerSpriteSize = {
            height : playerSprite.height | 0,
            width  : playerSprite.width | 0
        };

        // Save a reference to the canvas and it's offset data
        canvas       = $('#screen');
        canvasOffset = canvas.offset();
        canvasSize   = {
            width  : canvas[0].width,
            height : canvas[0].height
        };

        // Register the mouse and keyboard listeners
        KeyboardCat.register(KeyboardCat.KEYCODES.UP, moveUp, { raw: true, keyDown : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.DOWN, moveDown, { raw: true, keyDown : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.LEFT, moveLeft, { raw: true, keyDown : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.RIGHT, moveRight, { raw: true, keyDown : true });

        KeyboardCat.register(KeyboardCat.KEYCODES.UP, stopY, { raw: true, keyUp : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.DOWN, stopY, { raw: true, keyUp : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.LEFT, stopX, { raw: true, keyUp : true });
        KeyboardCat.register(KeyboardCat.KEYCODES.RIGHT, stopX, { raw: true, keyUp : true });

        // Reset the player data
        reset();
    }

    $.domReady(init);

    return {
        setSpriteScaling : setSpriteScaling,
        updatePosition   : updatePosition,
        hit              : hit,
        score            : score,
        reset            : reset
    };
})();

// Glue the events to the modules
$.domReady(function() {
    // Tie the Picaso vis to the data coming from the Audio Processor
    $(AudioProcessor).on('spectrum.audio', Picaso.setSpectrumData);
    $(AudioProcessor).on('canvasbg.audio', Picaso.setCanvasBG);

    // Tie the Overlord to the data coming from the Audio Processor
    $(AudioProcessor).on('enemies.audio', Overlord.generateEnemies);

    // Tie the Overlord to the player movement
    $(PlayerController).on('moved.player', Overlord.updatePlayer);

    // Tie the Player reset to the Overlord start event
    $(Overlord).on('start.overlord', PlayerController.reset);

    // Tie to the Picaso Tick event
    $(Picaso).on('tick.picaso', Overlord.tock);
    $(Picaso).on('tick.picaso', PlayerController.updatePosition);

    // Tie all the relevant parties to the Overlord for pausing/resuming
    $(Overlord).on('pause.overlord', Picaso.pause);
    $(Overlord).on('resume.overlord', Picaso.resume);
    $(Overlord).on('abort.overlord', Picaso.cleanObjects);

    $(Overlord).on('start.overlord', AudioProcessor.start);
    $(Overlord).on('pause.overlord', AudioProcessor.pause);
    $(Overlord).on('resume.overlord', AudioProcessor.resume);
    $(Overlord).on('abort.overlord', AudioProcessor.abort);

    // Set the sprite scaling on the PlayerController (so bounds can be checked)
    PlayerController.setSpriteScaling(Picaso.SPRITE_SCALING);
});

// Google Analytics
var _gaq=[['_setAccount','UA-XXXXX-X'],['_trackPageview']]; // Change UA-XXXXX-X to be your site's ID
(function(d,t){var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.async=1;
 g.src=('https:'==location.protocol?'//ssl':'//www')+'.google-analytics.com/ga.js';
 s.parentNode.insertBefore(g,s);}(document,'script'));

