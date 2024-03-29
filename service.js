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
/* exported HackableApp, enable, disable */
/* global global */

const {Gio, GLib, Shell} = imports.gi;
const ShellDBus = imports.ui.shellDBus;

const Main = imports.ui.main;

const CLUBHOUSE_ID = 'com.hack_computer.Clubhouse.desktop';

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Utils = Hack.imports.utils;

/* eslint class-methods-use-this: 'off' */
var Service = class {
    constructor() {
        this._settings = Utils.getSettings();
        const iface = Utils.loadInterfaceXML('com.hack_computer.hack');
        this._settingsHandlers = [];
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(iface, this);
        this._nameId = Gio.bus_own_name_on_connection(Gio.DBus.session, 'com.hack_computer.hack',
            Gio.BusNameOwnerFlags.REPLACE, null, null);

        try {
            this._dbusImpl.export(Gio.DBus.session, '/com/hack_computer/hack');
        } catch (e) {
            logError(e, 'Cannot export Hack service');
            return;
        }

        this._windowTrackId = Shell.WindowTracker.get_default().connect('notify::focus-app',
            this._checkFocusAppChanged.bind(this));
        this._settingsHandlers.push(this._settings.connect('changed::hack-icon-pulse', () => {
            this._dbusImpl.emit_property_changed('HackIconPulse',
                new GLib.Variant('b', this.HackIconPulse));
        }));
        this._settingsHandlers.push(this._settings.connect('changed::show-hack-launcher', () => {
            this._dbusImpl.emit_property_changed('ShowHackLauncher',
                new GLib.Variant('b', this.ShowHackLauncher));
        }));

        this._settingsHandlers.push(this._settings.connect('changed::wobbly-effect', () => {
            this._dbusImpl.emit_property_changed('WobblyEffect',
                new GLib.Variant('b', this.WobblyEffect));
        }));
        this._settingsHandlers.push(this._settings.connect('changed::wobbly-spring-k', () => {
            this._dbusImpl.emit_property_changed('WobblySpringK',
                new GLib.Variant('d', this.WobblySpringK));
        }));
        this._settingsHandlers.push(this._settings.connect('changed::wobbly-spring-friction', () => {
            this._dbusImpl.emit_property_changed('WobblySpringFriction',
                new GLib.Variant('d', this.WobblySpringFriction));
        }));
        this._settingsHandlers.push(this._settings.connect('changed::wobbly-slowdown-factor', () => {
            this._dbusImpl.emit_property_changed('WobblySlowdownFactor',
                new GLib.Variant('d', this.WobblySlowdownFactor));
        }));
        this._settingsHandlers.push(this._settings.connect('changed::wobbly-object-movement-range', () => {
            this._dbusImpl.emit_property_changed('WobblyObjectMovementRange',
                new GLib.Variant('d', this.WobblyObjectMovementRange));
        }));

        this._ifaceSettings = new Gio.Settings({
            schemaId: 'org.gnome.desktop.interface',
        });

        this._touchpadSettings = new Gio.Settings({
            schemaId: 'org.gnome.desktop.peripherals.touchpad',
        });

        this._mouseSettings = new Gio.Settings({
            schemaId: 'org.gnome.desktop.peripherals.mouse',
        });

        this._cursorSizeHandler = this._ifaceSettings.connect('changed::cursor-size', () => {
            this._dbusImpl.emit_property_changed('CursorSize',
                new GLib.Variant('i', this.CursorSize));
        });
        this._cursorThemeHandler = this._ifaceSettings.connect('changed::cursor-theme', () => {
            this._dbusImpl.emit_property_changed('CursorTheme',
                new GLib.Variant('s', this.CursorTheme));
        });
        this._speedHandler = this._mouseSettings.connect('changed::speed', () => {
            this._dbusImpl.emit_property_changed('MouseSpeed',
                new GLib.Variant('d', this.MouseSpeed));
        });
    }

    stop() {
        this._settingsHandlers.forEach(handler => this._settings.disconnect(handler));
        this._ifaceSettings.disconnect(this._cursorSizeHandler);
        this._ifaceSettings.disconnect(this._cursorThemeHandler);
        this._mouseSettings.disconnect(this._speedHandler);
        Shell.WindowTracker.get_default().disconnect(this._windowTrackId);

        try {
            this._dbusImpl.unexport();
        } catch (e) {
            logError(e, 'Cannot unexport Hack service');
        }

        if (this._nameId !== 0) {
            Gio.bus_unown_name(this._nameId);
            this._nameId = 0;
        }
    }

    MinimizeAll() {
        global.get_window_actors().forEach(actor => {
            actor.metaWindow.minimize();
        });
    }

    Pulse(activate) {
        this.HackIconPulse = activate;
    }

    _checkFocusAppChanged() {
        this._dbusImpl.emit_property_changed('FocusedApp', new GLib.Variant('s', this.FocusedApp));
    }

    get FocusedApp() {
        let appId = '';
        const tracker = Shell.WindowTracker.get_default();
        if (tracker.focus_app)
            appId = tracker.focus_app.get_id();
        return appId;
    }

    get HackIconPulse() {
        return this._settings.get_boolean('hack-icon-pulse');
    }

    set HackIconPulse(enabled) {
        this._settings.set_boolean('hack-icon-pulse', enabled);
    }

    get ShowHackLauncher() {
        return this._settings.get_boolean('show-hack-launcher');
    }

    set ShowHackLauncher(enabled) {
        this._settings.set_boolean('show-hack-launcher', enabled);
    }

    get WobblyEffect() {
        return this._settings.get_boolean('wobbly-effect');
    }

    set WobblyEffect(enabled) {
        this._settings.set_boolean('wobbly-effect', enabled);
    }

    get WobblySpringK() {
        return this._settings.get_double('wobbly-spring-k');
    }

    set WobblySpringK(value) {
        this._settings.set_double('wobbly-spring-k', value);
    }

    get WobblySpringFriction() {
        return this._settings.get_double('wobbly-spring-friction');
    }

    set WobblySpringFriction(value) {
        this._settings.set_double('wobbly-spring-friction', value);
    }

    get WobblySlowdownFactor() {
        return this._settings.get_double('wobbly-slowdown-factor');
    }

    set WobblySlowdownFactor(value) {
        this._settings.set_double('wobbly-slowdown-factor', value);
    }

    get WobblyObjectMovementRange() {
        return this._settings.get_double('wobbly-object-movement-range');
    }

    set WobblyObjectMovementRange(value) {
        this._settings.set_double('wobbly-object-movement-range', value);
    }

    get CursorSize() {
        return this._ifaceSettings.get_int('cursor-size');
    }

    set CursorSize(value) {
        this._ifaceSettings.set_int('cursor-size', value);
    }

    get CursorTheme() {
        return this._ifaceSettings.get_string('cursor-theme');
    }

    set CursorTheme(value) {
        this._ifaceSettings.set_string('cursor-theme', value);
    }

    get MouseSpeed() {
        return this._mouseSettings.get_double('speed');
    }

    set MouseSpeed(value) {
        this._touchpadSettings.set_double('speed', value);
        this._mouseSettings.set_double('speed', value);
    }
};

var HackableApp = class {
    constructor(session) {
        const HackableAppIface = Utils.loadInterfaceXML('com.hack_computer.HackableApp');
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(HackableAppIface, this);

        this._session = session;
        this._notifyStateId = this._session.connect('notify::state', this._stateChanged.bind(this));
    }

    export(objectId) {
        const objectPath = `/com/hack_computer/HackableApp/${objectId}`;
        try {
            this._dbusImpl.export(Gio.DBus.session, objectPath);
        } catch (e) {
            logError(e, `Cannot export HackableApp at path ${objectPath}`);
        }
    }

    stop() {
        this._session.disconnect(this._notifyStateId);
        this._dbusImpl.unexport();
    }

    _stateChanged() {
        const value = new GLib.Variant('u', this.State);
        this._dbusImpl.emit_property_changed('State', value);
    }

    get objectPath() {
        return this._dbusImpl.get_object_path();
    }

    get AppId() {
        return this._session.appId;
    }

    get State() {
        return this._session.state;
    }

    get ToolboxVisible() {
        if (!this._session.toolbox)
            return false;
        return this._session.toolbox.visible;
    }

    set ToolboxVisible(value) {
        if (!this._session.toolbox)
            return;
        this._session.toolbox.visible = value;
    }

    get PulseFlipToHackButton() {
        return this._session._button.highlighted;
    }

    set PulseFlipToHackButton(value) {
        this._session._button.highlighted = value;
    }
};

var HackableAppsManager = class {
    constructor() {
        const HackableAppsManagerIface = Utils.loadInterfaceXML('com.hack_computer.HackableAppsManager');
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(HackableAppsManagerIface, this);
        this._nameId = Gio.bus_own_name_on_connection(Gio.DBus.session, 'com.hack_computer.HackableAppsManager',
            Gio.BusNameOwnerFlags.REPLACE, null, null);

        try {
            this._dbusImpl.export(Gio.DBus.session, '/com/hack_computer/HackableAppsManager');
        } catch (e) {
            logError(e, 'Cannot export HackableAppsManager');
            return;
        }

        this._codeViewManager = Main.wm._codeViewManager;
        this._sessionAddedId = this._codeViewManager.connect('session-added', this._onSessionAdded.bind(this));
        this._sessionRemovedId = this._codeViewManager.connect('session-removed', this._onSessionRemoved.bind(this));

        this._nextId = 0;
    }

    stop() {
        this._codeViewManager.disconnect(this._sessionAddedId);
        this._codeViewManager.disconnect(this._sessionRemovedId);

        try {
            this._dbusImpl.unexport();
        } catch (e) {
            logError(e, 'Cannot unexport HackableAppsManager');
            return;
        }

        if (this._nameId !== 0) {
            Gio.bus_unown_name(this._nameId);
            this._nameId = 0;
        }
    }

    _emitCurrentlyHackableAppsChanged() {
        const value = new GLib.Variant('ao', this.CurrentlyHackableApps);
        this._dbusImpl.emit_property_changed('CurrentlyHackableApps', value);
    }

    _getNextId() {
        return ++this._nextId;
    }

    _onSessionAdded(_, session) {
        session.hackableApp.export(this._getNextId());
        this._emitCurrentlyHackableAppsChanged();
    }

    _onSessionRemoved(_, session) {
        session.hackableApp.stop();
        this._emitCurrentlyHackableAppsChanged();
    }

    get CurrentlyHackableApps() {
        const paths = [];
        for (const session of this._codeViewManager.sessions)
            paths.push(session.hackableApp.objectPath);
        return paths;
    }
};

var SHELL_DBUS_SERVICE = null;
var HACKABLE_APPS_MANAGER_SERVICE = null;

function enable() {
    const Settings = Utils.getSettings();

    SHELL_DBUS_SERVICE = new Service();
    HACKABLE_APPS_MANAGER_SERVICE = new HackableAppsManager();

    // TODO: integrate with eos-desktop@endlessm.com
    if (!Utils.desktopIs('endless', '3.36'))
        return;

    Utils.override(ShellDBus.AppStoreService, 'AddApplication', function (id) {
        ShellDBus._reportAppAddedMetric(id);

        if (id === CLUBHOUSE_ID) {
            Settings.set_boolean('show-hack-launcher', true);
            this._iconGridLayout.emit('layout-changed');
            return;
        }

        Utils.original(ShellDBus.AppStoreService, 'AddApplication').bind(this)(id);
    });

    Utils.override(ShellDBus.AppStoreService, 'AddAppIfNotVisible', function (id) {
        if (id === CLUBHOUSE_ID) {
            Settings.set_boolean('show-hack-launcher', true);
            this._iconGridLayout.emit('layout-changed');
            ShellDBus._reportAppAddedMetric(id);
            return;
        }

        Utils.original(ShellDBus.AppStoreService, 'AddAppIfNotVisible').bind(this)(id);
    });

    Utils.override(ShellDBus.AppStoreService, 'RemoveApplication', function (id) {
        if (id === CLUBHOUSE_ID) {
            Settings.set_boolean('show-hack-launcher', false);
            this._iconGridLayout.emit('layout-changed');
            return;
        }

        Utils.original(ShellDBus.AppStoreService, 'RemoveApplication').bind(this)(id);
    });
}

function disable() {
    // TODO: integrate with eos-desktop@endlessm.com
    if (Utils.desktopIs('endless', '3.36'))
        Utils.restore(ShellDBus.AppStoreService);

    if (SHELL_DBUS_SERVICE) {
        SHELL_DBUS_SERVICE.stop();
        SHELL_DBUS_SERVICE = null;
    }

    if (HACKABLE_APPS_MANAGER_SERVICE) {
        HACKABLE_APPS_MANAGER_SERVICE.stop();
        HACKABLE_APPS_MANAGER_SERVICE = null;
    }
}
