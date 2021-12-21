/*
 * Copyright © 2020 Endless OS Foundation LLC.
 *
 * This file is part of eos-hack-extension
 * (see https://github.com/endlessm/eos-hack-extension).
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */
/* exported enable, disable */
/* global global */
'use strict';

/**
 * This code is copied from:
 * https://github.com/hermes83/compiz-alike-windows-effect
 *
 */

const {GLib, GObject, Clutter, Meta} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Settings = Hack.imports.utils.getSettings();

const CLUTTER_TIMELINE_DURATION = 1000 * 1000;
const CORNER_RESIZING_DIVIDER = 6;

const EFFECT_NAME = 'wobbly-effect';
const MIN_MAX_EFFECT_NAME = 'min-max-wobbly-effect';

function is_managed_op(op) {
    return Meta.GrabOp.MOVING === op ||
           Meta.GrabOp.RESIZING_W === op ||
           Meta.GrabOp.RESIZING_E === op ||
           Meta.GrabOp.RESIZING_S === op ||
           Meta.GrabOp.RESIZING_N === op ||
           Meta.GrabOp.RESIZING_NW === op ||
           Meta.GrabOp.RESIZING_NE === op ||
           Meta.GrabOp.RESIZING_SE === op ||
           Meta.GrabOp.RESIZING_SW === op;
}

function get_actor(window) {
    if (window)
        return window.get_compositor_private();

    return null;
}

function has_wobbly_effect(actor) {
    return actor && actor.get_effect(EFFECT_NAME);
}

function add_actor_wobbly_effect(actor, op) {
    if (actor) {
        if (Meta.GrabOp.MOVING === op)
            actor.add_effect_with_name(EFFECT_NAME, new WobblyEffect({op}));
        else
            actor.add_effect_with_name(EFFECT_NAME, new ResizeEffect({op}));
    }
}

function add_actor_min_max_effect(actor, op) {
    if (actor)
        actor.add_effect_with_name(MIN_MAX_EFFECT_NAME, new MinimizeMaximizeEffect({op}));
}

function stop_actor_wobbly_effect(actor) {
    if (actor) {
        let effect = actor.get_effect(EFFECT_NAME);
        if (effect)
            effect.stop(actor);
    }
}

function destroy_actor_wobbly_effect(actor) {
    if (actor) {
        let effect = actor.get_effect(EFFECT_NAME);
        if (effect)
            effect.destroy();
    }
}

function destroy_actor_min_max_effect(actor) {
    if (actor) {
        let effect = actor.get_effect(MIN_MAX_EFFECT_NAME);
        if (effect)
            effect.destroy();
    }
}

var AbstractCommonEffect = GObject.registerClass({},
    class AbstractCommonEffect extends Clutter.DeformEffect {

        _init(params = {}) {
            super._init();

            this.allocationChangedEvent = null;
            this.paintEvent = null;
            this.newFrameEvent = null;
            this.parentActor = null;
            this.operationType = params.op;
            this.effectDisabled = false;
            this.timerId = null;
            this.initOldValues = true;
            this.i = 0;
            this.j = 0;
            this.k = 0;
            this.xPickedUp = 0;
            this.yPickedUp = 0;
            this.width = 0;
            this.height = 0;
            this.xNew = 0;
            this.yNew = 0;
            this.xOld = 0;
            this.yOld = 0;
            this.xDelta = 0;
            this.yDelta = 0;
            this.yDeltaStretch = 0;
            this.xDeltaStop = 0;
            this.yDeltaStop = 0;
            this.xDeltaStopMoving = 0;
            this.yDeltaStopMoving = 0;
            this.xDeltaFreezed = 0;
            this.yDeltaFreezed = 0;
            this.divider = 1;
            this.yCoefficient = 1;

            // Init settings
            const friction = Settings.get_double('wobbly-spring-friction');
            const spring = Settings.get_double('wobbly-spring-k');
            const slowdown = Settings.get_double('wobbly-slowdown-factor');

            this.MAXIMIZE_EFFECT_ENABLED = true;
            this.RESIZE_EFFECT_ENABLED = true;

            this.X_MULTIPLIER = (100 - friction) * 2 / 100;
            this.Y_MULTIPLIER = (100 - friction) * 2 / 100;
            this.Y_STRETCH_MULTIPLIER = (100 - friction) * 2 / 100;

            this.END_EFFECT_DIVIDER = 4;
            this.END_RESTORE_X_FACTOR = 0.3 * (100 - spring) / 100 + 1;
            this.END_RESTORE_Y_FACTOR = 0.3 * (100 - spring) / 100 + 1;
            this.END_FREEZE_X_FACTOR = spring / 100;
            this.END_FREEZE_Y_FACTOR = spring / 100;
            this.DELTA_FREEZED = 80 * spring / 100;

            this.STOP_COUNTER = 20;
            this.STOP_COUNTER_EXTRA = 1;
            this.RESTORE_FACTOR = 1 + slowdown / 10;
            this.X_TILES = 6;
            this.Y_TILES = 4;
        }

        vfunc_set_actor(actor) {
            super.vfunc_set_actor(actor);

            if (actor && !this.effectDisabled) {
                this.parentActor = actor.get_parent();
                this.set_n_tiles(this.X_TILES, this.Y_TILES);

                [this.width, this.height] = actor.get_size();

                this.allocationChangedEvent = actor.connect('notify::allocation', this.on_actor_event.bind(this));
                this.paintEvent = actor.connect('paint', () => {});

                this.start_timer(this.on_tick_elapsed.bind(this), actor);
            }
        }

        start_timer(timerFunction, actor) {
            this.stop_timer();
            this.timerId = new Clutter.Timeline({actor, duration: CLUTTER_TIMELINE_DURATION});
            this.newFrameEvent = this.timerId.connect('new-frame', timerFunction);
            this.timerId.start();
        }

        stop_timer() {
            if (this.timerId) {
                if (this.newFrameEvent) {
                    this.timerId.disconnect(this.newFrameEvent);
                    this.newFrameEvent = null;
                }
                this.timerId.run_dispose();
                this.timerId = null;
            }
        }

        destroy() {
            this.stop_timer();
            this.parentActor = null;
            const actor = this.get_actor();

            if (actor) {
                if (this.paintEvent) {
                    actor.disconnect(this.paintEvent);
                    this.paintEvent = null;
                }

                if (this.allocationChangedEvent) {
                    actor.disconnect(this.allocationChangedEvent);
                    this.allocationChangedEvent = null;
                }

                actor.remove_effect(this);
            }
        }

        stop(actor) {
            [this.xDeltaStop, this.yDeltaStop] = [this.xDelta * 1.5, this.yDelta * 1.5];
            [this.xDeltaStopMoving, this.yDeltaStopMoving] = [0, 0];
            this.i = 0;

            this.start_timer(this.on_stop_tick_elapsed.bind(this), actor);
        }

        on_stop_tick_elapsed() {
            this.i++;

            this.xDelta = this.xDeltaStop * Math.sin(this.i) / Math.exp(this.i / this.END_EFFECT_DIVIDER, 2);
            this.yDelta = this.yDeltaStop * Math.sin(this.i) / Math.exp(this.i / this.END_EFFECT_DIVIDER, 2);
            this.yDeltaStretch = this.yDelta;

            this.invalidate();

            return true;
        }
    }
);

var WobblyEffect = GObject.registerClass({},
    class WobblyEffect extends AbstractCommonEffect {
        on_actor_event(actor, allocation) {
            [this.xNew, this.yNew] = [actor.get_x(), actor.get_y()];
            [this.width, this.height] = actor.get_size();

            if (this.initOldValues) {
                let [xMouse, yMouse] = global.get_pointer();

                [this.xOld, this.yOld] = [this.xNew, this.yNew];
                [this.xPickedUp, this.yPickedUp] = [xMouse - this.xNew, yMouse - this.yNew];

                this.yCoefficient = (1 - this.yPickedUp / this.height) / (Math.pow(this.width, 2) * this.height);

                this.initOldValues = false;
            }

            this.xDelta += (this.xOld - this.xNew) * this.X_MULTIPLIER;
            this.yDelta += (this.yOld - this.yNew) * this.Y_MULTIPLIER;
            this.yDeltaStretch += (this.yOld - this.yNew) * this.Y_STRETCH_MULTIPLIER;

            [this.xOld, this.yOld] = [this.xNew, this.yNew];

            this.j = this.STOP_COUNTER + this.STOP_COUNTER_EXTRA;
            this.xDeltaFreezed = this.xDelta * this.END_FREEZE_X_FACTOR;
            this.yDeltaFreezed = this.yDelta * this.END_FREEZE_Y_FACTOR;
            [this.xDeltaStopMoving, this.yDeltaStopMoving] = [0, 0];

            return false;
        }

        on_tick_elapsed() {
            this.xDelta /= this.RESTORE_FACTOR;
            this.yDelta /= this.RESTORE_FACTOR;
            this.yDeltaStretch /= this.RESTORE_FACTOR;

            this.j--;
            if (this.j < 0) {
                this.j = 0;
            } else if (this.j < this.STOP_COUNTER) {
                this.xDeltaFreezed /= this.END_RESTORE_X_FACTOR;
                this.yDeltaFreezed /= this.END_RESTORE_Y_FACTOR;
                this.xDeltaStopMoving = this.xDeltaFreezed * Math.sin(Math.PI * 2 * this.j / this.STOP_COUNTER);
                this.yDeltaStopMoving = this.yDeltaFreezed * Math.sin(Math.PI * 2 * this.j / this.STOP_COUNTER);
            }

            this.invalidate();

            return true;
        }

        vfunc_deform_vertex(w, h, v) {
            v.x += (1 - Math.cos(Math.PI * v.y / h / 2)) * this.xDelta / 2
                + Math.abs(this.xPickedUp - v.x) / w * this.xDeltaStopMoving;

            if (this.xPickedUp < w / 5) {
                v.y += this.yDelta - Math.pow(w - v.x, 2) * this.yDelta * (h - v.y) * this.yCoefficient
                    + Math.abs(this.yPickedUp - v.y) / h * this.yDeltaStopMoving;
            } else if (this.xPickedUp > w * 0.8) {
                v.y += this.yDelta - Math.pow(v.x, 2) * this.yDelta * (h - v.y) * this.yCoefficient
                    + Math.abs(this.yPickedUp - v.y) / h * this.yDeltaStopMoving;
            } else {
                v.y += Math.pow(v.x - this.xPickedUp, 2) * this.yDelta * (h - v.y) * this.yCoefficient
                    + this.yDeltaStretch * v.y / h
                    + Math.abs(this.yPickedUp - v.y) / h * this.yDeltaStopMoving;
            }
        }
    }
);

var ResizeEffect = GObject.registerClass({},
    class ResizeEffect extends AbstractCommonEffect {

        _init(params = {}) {
            super._init(params);

            this.effectDisabled = !this.RESIZE_EFFECT_ENABLED;
        }

        on_actor_event(actor) {
            [this.xNew, this.yNew] = global.get_pointer();

            if (this.initOldValues) {
                let [xWin, yWin] = actor.get_position();

                [this.xOld, this.yOld] = [this.xNew, this.yNew];
                [this.xPickedUp, this.yPickedUp] = [this.xNew - xWin, this.yNew - yWin];

                this.initOldValues = false;
            }

            this.xDelta += (this.xOld - this.xNew) * this.X_MULTIPLIER;
            this.yDelta += (this.yOld - this.yNew) * this.Y_MULTIPLIER;

            [this.xOld, this.yOld] = [this.xNew, this.yNew];
        }

        on_tick_elapsed() {
            return true;
        }

        vfunc_deform_vertex(w, h, v) {
            switch (this.operationType) {
            case Meta.GrabOp.RESIZING_W:
                v.x += this.xDelta * (w - v.x) * Math.pow(v.y - this.yPickedUp, 2) / (Math.pow(h, 2) * w);
                break;

            case Meta.GrabOp.RESIZING_E:
                v.x += this.xDelta * v.x * Math.pow(v.y - this.yPickedUp, 2) / (Math.pow(h, 2) * w);
                break;

            case Meta.GrabOp.RESIZING_S:
                v.y += this.yDelta * v.y * Math.pow(v.x - this.xPickedUp, 2) / (Math.pow(w, 2) * h);
                break;

            case Meta.GrabOp.RESIZING_N:
                v.y += this.yDelta * (h - v.y) * Math.pow(v.x - this.xPickedUp, 2) / (Math.pow(w, 2) * h);
                break;

            case Meta.GrabOp.RESIZING_NW:
                v.x += this.xDelta / CORNER_RESIZING_DIVIDER * (w - v.x) * Math.pow(v.y, 2) / (Math.pow(h, 2) * w);
                v.y +=  this.yDelta / CORNER_RESIZING_DIVIDER * (h - v.y) * Math.pow(v.x, 2) / (Math.pow(w, 2) * h);
                break;

            case Meta.GrabOp.RESIZING_NE:
                v.x += this.xDelta / CORNER_RESIZING_DIVIDER * v.x * Math.pow(v.y, 2) / (Math.pow(h, 2) * w);
                v.y += this.yDelta / CORNER_RESIZING_DIVIDER * (h - v.y) * Math.pow(w - v.x, 2) / (Math.pow(w, 2) * h);
                break;

            case Meta.GrabOp.RESIZING_SE:
                v.x += this.xDelta / CORNER_RESIZING_DIVIDER * v.x * Math.pow(h - v.y, 2) / (Math.pow(h, 2) * w);
                v.y += this.yDelta / CORNER_RESIZING_DIVIDER * v.y * Math.pow(w - v.x, 2) / (Math.pow(w, 2) * h);
                break;

            case Meta.GrabOp.RESIZING_SW:
                v.x += this.xDelta / CORNER_RESIZING_DIVIDER * (w - v.x) * Math.pow(v.y - h, 2) / (Math.pow(h, 2) * w);
                v.y += this.yDelta / CORNER_RESIZING_DIVIDER * v.y * Math.pow(v.x, 2) / (Math.pow(w, 2) * h);
                break;
            }

        }
    }
);

var MinimizeMaximizeEffect = GObject.registerClass({},
    class MinimizeMaximizeEffect extends AbstractCommonEffect {

        _init(params = {}) {
            super._init(params);

            this.j = this.STOP_COUNTER + this.STOP_COUNTER_EXTRA;
            this.xDeltaFreezed = this.DELTA_FREEZED;
            this.yDeltaFreezed = this.DELTA_FREEZED;

            this.effectDisabled = !this.MAXIMIZE_EFFECT_ENABLED;
        }

        on_actor_event() {}

        on_tick_elapsed() {
            this.j--;
            if (this.j < 0) {
                this.j = 0;
            } else {
                this.xDeltaFreezed /= 1.2;
                this.yDeltaFreezed /= 1.2;

                this.xDeltaStopMoving = this.xDeltaFreezed * Math.sin(Math.PI * 8 * this.j / this.STOP_COUNTER);
                this.yDeltaStopMoving = this.yDeltaFreezed * Math.sin(Math.PI * 8 * this.j / this.STOP_COUNTER);

                this.invalidate();
            }

            return true;
        }

        vfunc_deform_vertex(w, h, v) {
            v.x += this.xDeltaStopMoving;
            v.y += this.yDeltaStopMoving;
        }

    }
);

const TIMEOUT_DELAY = 1500;

let grabOpBeginId = 0;
let grabOpEndId = 0;
let resizeMinMaxOpId = 0;
let timeoutWobblyId = 0;
let timeoutMinMaxId = 0;
let wobblyEnabledId = 0;

function stop_wobbly_timer() {
    if (timeoutWobblyId) {
        GLib.source_remove(timeoutWobblyId);
        timeoutWobblyId = 0;
    }
}

function stop_min_max_timer() {
    if (timeoutMinMaxId) {
        GLib.source_remove(timeoutMinMaxId);
        timeoutMinMaxId = 0;
    }
}

function enable() {
    if (wobblyEnabledId)
        Settings.disconnect(wobblyEnabledId);

    if (grabOpBeginId)
        global.display.disconnect(grabOpBeginId);

    if (grabOpEndId)
        global.display.disconnect(grabOpEndId);

    if (resizeMinMaxOpId)
        global.window_manager.disconnect(resizeMinMaxOpId);

    wobblyEnabledId = Settings.connect('changed::wobbly-effect', () => {
        const enabled = Settings.get_boolean('wobbly-effect');
        if (enabled)
            enable();
        else
            disable(false);
    });

    if (!Settings.get_boolean('wobbly-effect')) {
        // wobbly effect not enabled
        return;
    }

    grabOpBeginId = global.display.connect('grab-op-begin', (display, screen, window, op) => {
        if (!is_managed_op(op))
            return;

        let actor = get_actor(window);
        if (actor) {
            stop_wobbly_timer();
            stop_min_max_timer();

            destroy_actor_wobbly_effect(actor);
            destroy_actor_min_max_effect(actor);
            add_actor_wobbly_effect(actor, op);
        }
    });

    grabOpEndId = global.display.connect('grab-op-end', (display, screen, window) => {
        let actor = get_actor(window);
        if (actor) {
            stop_actor_wobbly_effect(actor);

            timeoutWobblyId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_DELAY, () => {
                stop_wobbly_timer();

                actor = get_actor(window);
                if (actor)
                    destroy_actor_wobbly_effect(actor);

                return false;
            });
        }
    });

    resizeMinMaxOpId = global.window_manager.connect('size-change', (e, actor, op) => {
        if (op === 1 && has_wobbly_effect(actor))
            return;

        stop_wobbly_timer();
        destroy_actor_wobbly_effect(actor);

        stop_min_max_timer();
        destroy_actor_min_max_effect(actor);

        add_actor_min_max_effect(actor, op);
        timeoutMinMaxId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_DELAY, () => {
            stop_min_max_timer();

            if (actor)
                destroy_actor_min_max_effect(actor);

            return false;
        });
    });
}

function disable(disconnect = true) {
    if (disconnect && wobblyEnabledId) {
        Settings.disconnect(wobblyEnabledId);
        wobblyEnabledId = 0;
    }

    if (grabOpBeginId) {
        global.display.disconnect(grabOpBeginId);
        grabOpBeginId = 0;
    }
    if (grabOpEndId) {
        global.display.disconnect(grabOpEndId);
        grabOpEndId = 0;
    }
    if (resizeMinMaxOpId) {
        global.window_manager.disconnect(resizeMinMaxOpId);
        resizeMinMaxOpId = 0;
    }

    stop_wobbly_timer();

    global.get_window_actors().forEach(actor => {
        destroy_actor_wobbly_effect(actor);
        destroy_actor_min_max_effect(actor);
    });
}
