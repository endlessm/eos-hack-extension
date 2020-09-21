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
/* exported createInfoPopup, destroyInfoPopup */

const {Clutter, Graphene, Gio, GLib, GObject, Pango, St} = imports.gi;

const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Utils = Hack.imports.utils;
const _ = Hack.imports.utils.gettext;

var HackPopupMenuItem = GObject.registerClass(
class HackPopupMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(params) {
        super._init(params);
        this.style_class = 'hack-popup-menu-item';

        /* Translators: The 'Endless Hack' is not translatable, it's the brand name */
        const title = _('Endless Hack: Unlock infinite possibilities through coding');
        /* Translators: The 'Hack' is not translatable, it's the brand name */
        const description = _('Hack is a new learning platform from Endless, focused on teaching the foundations of programming and creative problem-solving to kids, ages 10 and up. With 5 different pathways, Hack has a variety of activities that teach a wide range of skills and concepts - check it out!');
        const image = `file://${Hack.path}/data/icons/hack-tooltip.png`;
        const iconFile = Gio.File.new_for_uri(image);
        const gicon = new Gio.FileIcon({file: iconFile});

        this.icon = new St.Icon({
            gicon,
            icon_size: 180,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            style_class: 'hack-tooltip-icon',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this.title = new St.Label({
            style_class: 'hack-tooltip-title',
            text: title,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.desc = new St.Label({
            style_class: 'hack-tooltip-desc',
            text: description,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.desc.clutter_text.set_line_wrap(true);
        this.desc.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.desc.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        this.rightBox = new St.BoxLayout({
            style_class: 'hack-popup-menu-item-right',
            vertical: true,
        });
        this.rightBox.add_child(this.title);
        this.rightBox.add_child(this.desc);

        this.add_child(this.icon);
        this.add_child(this.rightBox);
    }
});

function createInfoPopup() {
    this._infoPopupId = null;
    this._infoPopup = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0);
    this._infoPopup.box.add_style_class_name('hack-tooltip');
    this._infoPopup.actor.add_style_class_name('hack-tooltip-arrow');
    this._infoMenuItem = new HackPopupMenuItem();
    this._infoPopup.addMenuItem(this._infoMenuItem);

    this._infoPopup.actor.hide();
    Main.uiGroup.add_actor(this._infoPopup.actor);

    this._infoPopup.connect('destroy', () => {
        if (this._infoPopupId) {
            GLib.source_remove(this._infoPopupId);
            this._infoPopupId = null;
        }
    });

    this.track_hover = true;
    return this.connect('notify::hover', () => {
        if (this.hover) {
            if (this._infoPopupId)
                GLib.source_remove(this._infoPopupId);

            this._infoPopupId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                300, () => {
                    this._infoPopupId = null;
                    if (this._infoPopup)
                        this._infoPopup.open();
                });
        } else {
            if (this._infoPopupId) {
                GLib.source_remove(this._infoPopupId);
                this._infoPopupId = null;
            }
            if (this._infoPopup)
                this._infoPopup.close();
        }
    });
}

function destroyInfoPopup(handler) {
    this._infoPopup.destroy();
    this._infoPopupId = null;
    this._infoPopup = null;
    this._infoMenuItem = null;
    this.disconnect(handler);
}
