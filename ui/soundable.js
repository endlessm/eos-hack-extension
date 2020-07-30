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
/* exported Button */

const {GObject, St} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();

const SoundServer = Hack.imports.misc.soundServer;


var Button = GObject.registerClass({
    Properties: {
        'click-sound-event-id': GObject.ParamSpec.string(
            'click-sound-event-id',
            '',
            '',
            GObject.ParamFlags.READWRITE,
            '',
        ),
        'enter-sound-event-id': GObject.ParamSpec.string(
            'enter-sound-event-id',
            '',
            '',
            GObject.ParamFlags.READWRITE,
            '',
        ),
        'hover-sound-event-id': GObject.ParamSpec.string(
            'hover-sound-event-id',
            '',
            '',
            GObject.ParamFlags.READWRITE,
            '',
        ),
        'stop-hover-sound-on-click': GObject.ParamSpec.boolean(
            'stop-hover-sound-on-click',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
            false,
        ),
    },
}, class SoundableButton extends St.Button {
    _init(params) {
        this._hoverSoundItem = null;

        super._init(params);

        this.connect('clicked', this._onClicked.bind(this));
        this.connect('notify::hover', this._onHoverChanged.bind(this));
        this.connect('notify::visible', this._onVisibleChanged.bind(this));
    }

    set hover_sound_event_id(value) {
        if (this._hoverSoundItem &&
            this._hoverSoundItem.name === value)
            return;

        this._stopHoverSound();
        this._hoverSoundItem = null;

        if (value)
            this._hoverSoundItem = new SoundServer.SoundItem(value);
    }

    get hover_sound_event_id() {
        if (this._hoverSoundItem)
            return this._hoverSoundItem.name;
        return null;
    }

    _onClicked() {
        if (this.stop_hover_sound_on_click)
            this._stopHoverSound();
        if (this.click_sound_event_id)
            SoundServer.getDefault().play(this.click_sound_event_id);
    }

    _onHoverChanged() {
        if (this.hover)
            this._startHoverSound();
        else
            this._stopHoverSound();
    }

    _onVisibleChanged() {
        if (!this.visible)
            this._stopHoverSound();
    }

    _startHoverSound() {
        if (this.enter_sound_event_id)
            SoundServer.getDefault().play(this.enter_sound_event_id);
        if (this._hoverSoundItem)
            this._hoverSoundItem.play();
    }

    _stopHoverSound() {
        if (this._hoverSoundItem)
            this._hoverSoundItem.stop();
    }
});
