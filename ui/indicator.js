/*
 * Copyright © 2021 Endless OS Foundation LLC.
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
// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported HackIndicator */

const {Clutter, Gio, GObject, St} = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Settings = Hack.imports.utils.getSettings();
const _ = Hack.imports.utils.gettext;

var HackIndicator = GObject.registerClass(
class HackIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, "Hack");

        this.icon = new St.Icon({ style_class: 'system-status-icon' });
        this.icon.gicon = Gio.icon_new_for_string(`${Hack.path}/data/icons/hack-button-symbolic.svg`);
        this.add_child(this.icon);

        this._tooltipEnabled = _('Flip to hack button is enabled.\nClick this button to disable.');
        this._tooltipDisabled = _('Flip to hack button is disabled.\nClick this button to enable.');

        this.connect('button-press-event', () => {
            this.toggle();
            this.menu.open();
        });

        this._tooltipItem = new PopupMenu.PopupMenuItem(this._tooltipEnabled, {
            activate: false,
            hover: false,
        });
        this.menu.addMenuItem(this._tooltipItem);

        this.track_hover = true;
        this._tooltipHandler = this.connect('notify::hover', () => {
            if (this.hover)
                this.menu.open();
            else
                this.menu.close();
        });

        this._active = Settings.get_boolean('enable-flip-to-hack');
        this.updateButton();

        this._settingsHandler = Settings.connect('changed::enable-flip-to-hack', (arg) => {
            this._active = Settings.get_boolean('enable-flip-to-hack');
            this.updateButton();
        });
    }

    destroy() {
        Settings.disconnect(this._settingsHandler);
        super.destroy();
    }

    toggle() {
        this._active = !this._active;
        Settings.set_boolean('enable-flip-to-hack', this._active);
        this.updateButton();
    }

    updateButton() {
        if (this._active) {
            this.opacity = 255;
            this._tooltipItem.label.set_text(this._tooltipEnabled);
        } else {
            this.opacity = 100;
            this._tooltipItem.label.set_text(this._tooltipDisabled);
        }
        this.updateSessions();
    }

    updateSessions() {
        const manager = Main.wm._codeViewManager;
        if (!manager) {
            return;
        }

        manager.sessions.forEach((s) => {
            s._syncButtonVisibility();
        });
    }
});
