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

const {Clutter, Graphene, Gio, GLib, GObject, Pango, Shell, St} = imports.gi;

const AppDisplay = imports.ui.appDisplay;
const IconGridLayout = imports.ui.iconGridLayout;
const DND = imports.ui.dnd;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Settings = Hack.imports.utils.getSettings();
const Utils = Hack.imports.utils;
const _ = Hack.imports.utils.gettext;

function _shouldShowHackLauncher() {
    const ParentalControlsManager = imports.misc.parentalControlsManager;
    const parentalControlsManager = ParentalControlsManager.getDefault();
    const app = Utils.getClubhouseApp();

    // Only show the hack icon if the clubhouse app is in the system
    const show = Settings.get_boolean('show-hack-launcher');
    return show && app && parentalControlsManager.shouldShowApp(app.app_info);
}

var HackAppIcon = GObject.registerClass(
class HackAppIcon extends AppDisplay.AppIcon {
    _init() {
        const iconParams = {
            isDraggable: true,
            showMenu: true,
            createIcon: this._createIcon.bind(this),
        };

        const app = Utils.getClubhouseApp();
        this._activated = false;

        super._init(app, iconParams);

        this._createInfoPopup();

        this.track_hover = true;
        this.connect('notify::hover', () => {
            if (this.hover) {
                this._infoPopupId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    300, () => {
                        this._infoPopupId = null;
                        this._infoPopup.open();
                    });
            } else {
                if (this._infoPopupId) {
                    GLib.source_remove(this._infoPopupId);
                    this._infoPopupId = null;
                }
                this._infoPopup.close();
            }
        });

        this._pulse = Settings.get_boolean('hack-icon-pulse');
        this._pulseWaitId = 0;

        this._activated = Settings.get_boolean('hack-mode-enabled');
        this.icon.update();

        this._hackModeId = Settings.connect('changed::hack-mode-enabled', () => {
            this._activated = Settings.get_boolean('hack-mode-enabled');
            this.icon.update();
        });

        this._hackPulseId = Settings.connect('changed::hack-icon-pulse', () => {
            this._pulse = Settings.get_boolean('hack-icon-pulse');
            if (this._pulseWaitId) {
                GLib.source_remove(this._pulseWaitId);
                this._pulseWaitId = 0;
            }
            if (this._pulse)
                this._startPulse();
        });

        if (this._pulse)
            this._startPulse();
    }

    _startPulse() {
        const params = {
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        };
        this._easeIcon({...params, scale_x: 1.1, scale_y: 1.1})
            .then(this._easeIcon.bind(this, {...params, scale_x: 0.9, scale_y: 0.9}))
            .then(this._easeIcon.bind(this, {...params, scale_x: 1.1, scale_y: 1.1}))
            .then(this._easeIcon.bind(this, {...params, scale_x: 0.9, scale_y: 0.9}))
            .then(this._easeIcon.bind(this, {...params, scale_x: 1.0, scale_y: 1.0}))
            .then(() => {
                this._pulseWaitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    this._pulseWaitId = 0;
                    if (this._pulse)
                        this._startPulse();
                    return GLib.SOURCE_REMOVE;
                });
            });
    }

    _easeIcon(easeParams) {
        return new Promise(resolve => {
            const params = {...easeParams, onComplete: () => resolve(this)};
            this.icon.icon.ease(params);
        });
    }

    _createIcon(iconSize) {
        let iconUri = `file://${Hack.path}/data/icons/hack-button-off.svg`;
        if (this._activated)
            iconUri = `file://${Hack.path}/data/icons/hack-button-on.svg`;

        const iconFile = Gio.File.new_for_uri(iconUri);
        const gicon = new Gio.FileIcon({file: iconFile});

        return new St.Icon({
            gicon,
            icon_size: iconSize,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
    }

    getDragActor() {
        return this._createIcon(this._iconSize);
    }

    activate() {
        Settings.set_boolean('hack-icon-pulse', false);

        // We should activate the clubhouse using the DBus API because some
        // toolbox windows shares the same app so activating the app could not
        // show the clubhouse window sometimes.
        const params = GLib.Variant.new('(a{sv})', [{}]);
        Gio.DBus.session.call(
            'com.hack_computer.Clubhouse',
            '/com/hack_computer/Clubhouse',
            'org.gtk.Application',
            'Activate', params, null,
            Gio.DBusCallFlags.NONE,
            -1, null,
            (conn, res) => conn.call_finish(res)
        );
    }

    _canAccept() {
        return false;
    }

    // Override to avoid animation on launch
    animateLaunch() {
    }

    remove() {
        Settings.set_boolean('show-hack-launcher', false);
        const iconGridLayout = IconGridLayout.getDefault();
        iconGridLayout.emit('layout-changed');
    }

    get name() {
        return 'Hack';
    }

    _onDestroy() {
        if (this._hackModeId)
            Settings.disconnect(this._hackModeId);
        if (this._hackPulseId)
            Settings.disconnect(this._hackPulseId);
        if (this._pulseWaitId)
            GLib.source_remove(this._pulseWaitId);
        super._onDestroy();
    }

    handleDragOver() {
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop() {
        // This will catch the drop event and do nothing
        return true;
    }

    popupMenu() {
        if (this._infoPopupId) {
            GLib.source_remove(this._infoPopupId);
            this._infoPopupId = null;
        }
        this._infoPopup.close();
        super.popupMenu();
    }

    _createInfoPopup() {
        this._infoPopupId = null;
        this._infoPopup = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0);
        this._infoPopup.box.add_style_class_name('hack-tooltip');
        this._infoPopup.actor.add_style_class_name('hack-tooltip-arrow');
        this._infoMenuItem = new HackPopupMenuItem();
        this._infoPopup.addMenuItem(this._infoMenuItem);

        this._infoPopup.actor.hide();
        Main.uiGroup.add_actor(this._infoPopup.actor);
    }

    _updateRunningStyle() {
        const running = this.app.state !== Shell.AppState.STOPPED;
        global.hack = this.app;

        // Only show the dot if the clubhouse window is visible
        const windows = this.app.get_windows();
        const clubhouse = windows.find(w => w.get_gtk_application_id() === 'com.hack_computer.Clubhouse');

        if (running && clubhouse)
            this._dot.show();
        else
            this._dot.hide();
    }
});

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

// Monkey patching
const CLUBHOUSE_ID = 'com.hack_computer.Clubhouse.desktop';

// one icon for each AppDisplay, there's two, the main and the gray
var HackIcons = new Utils.ObjectsMap();

function enable() {
    Utils.override(AppDisplay.AppDisplay, '_loadApps', function () {
        const newApps = Utils.original(AppDisplay.AppDisplay, '_loadApps').bind(this)();

        if (_shouldShowHackLauncher()) {
            let icon = HackIcons.get(this);
            if (!icon) {
                icon = new HackAppIcon();
                icon.connect('destroy', i => {
                    HackIcons.delValue(i);
                });
                HackIcons.set(this, icon);
            }

            newApps.unshift(icon);
        }

        return newApps;
    });
    Utils.override(IconGridLayout.IconGridLayout, 'removeIcon', function (id, interactive) {
        if (id === CLUBHOUSE_ID) {
            HackIcons.forEach((k, v) => v.remove());

            let info = null;
            let appSystem = Shell.AppSystem.get_default();
            let app = appSystem.lookup_alias(id);
            if (app)
                info = app.get_app_info();

            // undo action
            if (interactive) {
                let options = {
                    forFeedback: true,
                    destroyCallback: () => this._onMessageDestroy(info),
                    undoCallback: () => {
                        this._removeUndone = true;
                        Settings.set_boolean('show-hack-launcher', true);
                        this.emit('layout-changed');
                    },
                };

                Main.overview.setMessage(_('%s has been removed').format('Hack'), options);
            } else {
                this._onMessageDestroy(info);
            }

            return;
        }

        Utils.original(IconGridLayout.IconGridLayout, 'removeIcon').bind(this)(id, interactive);
    });

    // Disable movements
    Utils.override(AppDisplay.BaseAppView, '_canAccept', function (source) {
        // Disable movement of the HackAppIcon
        if (source instanceof HackAppIcon)
            return false;

        return Utils.original(AppDisplay.BaseAppView, '_canAccept').bind(this)(source);
    });

    Utils.override(AppDisplay.FolderIcon, '_canAccept', function (source) {
        // Disable movement of the HackAppIcon
        if (source instanceof HackAppIcon)
            return false;

        return Utils.original(AppDisplay.FolderIcon, '_canAccept').bind(this)(source);
    });

    Utils.override(AppDisplay.AppIcon, '_canAccept', function (source) {
        // Disable movement of the HackAppIcon
        if (source instanceof HackAppIcon)
            return false;

        return Utils.original(AppDisplay.AppIcon, '_canAccept').bind(this)(source);
    });

    const iconGridLayout = IconGridLayout.getDefault();
    iconGridLayout.emit('layout-changed');
}

function disable() {
    HackIcons = new Utils.ObjectsMap();

    Utils.restore(AppDisplay.BaseAppView);
    Utils.restore(AppDisplay.FolderIcon);
    Utils.restore(AppDisplay.AppIcon);

    Utils.restore(AppDisplay.AppDisplay);
    Utils.restore(IconGridLayout.IconGridLayout);

    const iconGridLayout = IconGridLayout.getDefault();
    iconGridLayout.emit('layout-changed');
}
