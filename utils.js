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
/* exported getSettings, loadInterfaceXML, override, overrideProperty, restore, original, tryMigrateSettings, ObjectsMap, gettext, desktopIs, getClubhouseApp, waitForExtension, runWithExtension */

const {Gio, GLib, Shell} = imports.gi;
const {config} = imports.misc;
const Gettext = imports.gettext.domain('hack-extension');
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;

var {gettext} = Gettext;

function getMigrationSettings(schemaId = 'org.gnome.shell') {
    const dir = Extension.dir.get_child('migration').get_path();
    const source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(), false);

    if (!source)
        throw new Error('Error Initializing the thingy.');

    const schema = source.lookup(schemaId, false);

    if (!schema)
        throw new Error('Schema missing.');

    return new Gio.Settings({settings_schema: schema});
}

function getSettings() {
    const schema = 'org.endlessos.hack-extension';
    return ExtensionUtils.getSettings(schema);
}

function tryMigrateSettings() {
    const settings = getSettings();
    if (settings.get_boolean('hack-settings-migrated'))
        return;

    const oldSettings = getMigrationSettings('org.gnome.shell');
    const renameSettings = getMigrationSettings('com.endlessm.hack-extension');
    const boolSettings = [
        'hack-icon-pulse',
        'show-hack-launcher',
        'wobbly-effect',
    ];
    const floatSettings = [
        'wobbly-spring-k',
        'wobbly-spring-friction',
        'wobbly-slowdown-factor',
        'wobbly-object-movement-range',
    ];

    // if the migration from the shell settings has been done, we try the
    // migration from the old settings
    const oldMigrated = renameSettings.get_boolean('hack-settings-migrated');
    const s = oldMigrated ? renameSettings : oldSettings;

    boolSettings.forEach(k => {
        settings.set_boolean(k, s.get_boolean(k));
    });
    floatSettings.forEach(k => {
        settings.set_double(k, s.get_double(k));
    });

    settings.set_boolean('hack-settings-migrated', true);
}

function loadInterfaceXML(iface) {
    const dir = Extension.dir.get_child('data').get_child('dbus-interfaces')
        .get_path();

    let xml = null;
    const uri = `file://${dir}/${iface}.xml`;
    const f = Gio.File.new_for_uri(uri);

    try {
        const [, bytes] = f.load_contents(null);
        if (bytes instanceof Uint8Array)
            xml = imports.byteArray.toString(bytes);
        else
            xml = bytes.toString();
    } catch (e) {
        log(`Failed to load D-Bus interface ${iface}`);
    }

    return xml;
}

function override(object, methodName, callback) {
    if (!object._hackOverrides)
        object._hackOverrides = {};

    const baseObject = object.prototype || object;
    const originalMethod = baseObject[methodName];
    object._hackOverrides[methodName] = originalMethod;
    baseObject[methodName] = callback;
}

function overrideProperty(object, propertyName, descriptor) {
    if (!object._hackPropOverrides)
        object._hackPropOverrides = {};

    const baseObject = object.prototype || object;
    const originalProperty =
        Object.getOwnPropertyDescriptor(baseObject, propertyName);
    object._hackPropOverrides[propertyName] = originalProperty;
    Object.defineProperty(baseObject, propertyName, descriptor);
}

function restore(object) {
    const baseObject = object.prototype || object;
    if (object._hackOverrides) {
        Object.keys(object._hackOverrides).forEach(k => {
            baseObject[k] = object._hackOverrides[k];
        });
        delete object._hackOverrides;
    }
    if (object._hackPropOverrides) {
        Object.keys(object._hackPropOverrides).forEach(k => {
            Object.defineProperty(baseObject, k,
                object._hackPropOverrides[k]);
        });
        delete object._hackPropOverrides;
    }
}

function original(object, methodName) {
    return object._hackOverrides[methodName];
}

// We can't use WeakMap here because we need to iterate all items and it's not
// recommendted to use objects as keys so this class is a helper class to
// store all icons with AppDisplay object as keys.
var ObjectsMap =
class ObjectsMap {
    constructor() {
        this._keys = [];
        this._values = [];
    }

    set(k, v) {
        const index = this._keys.indexOf(k);
        if (index < 0) {
            this._keys.push(k);
            this._values.push(v);
        } else {
            this._values[index] = v;
        }
    }

    get(k) {
        const index = this._keys.indexOf(k);
        if (index < 0)
            return undefined;

        return this._values[index];
    }

    del(k) {
        const index = this._keys.indexOf(k);
        if (index < 0)
            return;

        this._keys.splice(index, 1);
        this._values.splice(index, 1);
    }

    delValue(k) {
        const index = this._values.indexOf(k);
        if (index < 0)
            return;

        this._keys.splice(index, 1);
        this._values.splice(index, 1);
    }

    forEach(f) {
        this._keys.forEach((k, index) => {
            f(k, this._values[index]);
        });
    }
};

const _currentDesktopsMatches = {};
// desktopIs:
// @name: desktop string you want to assert if it matches the current desktop env
//
// The function examples XDG_CURRENT_DESKTOP and return if the current desktop
// is part of that desktop string.
//
// Return value: if the environment isn't set or doesn't match, return False
// otherwise, return True.
//
// This function is a copy of:
// https://github.com/endlessm/gnome-shell/blob/master/js/misc/desktop.js
function desktopIs(name, maxVersion = config.PACKAGE_VERSION) {
    if (config.PACKAGE_VERSION > maxVersion)
        return false;

    if (typeof _currentDesktopsMatches[name] !== 'undefined')
        return _currentDesktopsMatches[name];

    const desktopsEnv = GLib.getenv('XDG_CURRENT_DESKTOP');
    if (!desktopsEnv) {
        _currentDesktopsMatches[name] = false;
        return false;
    }

    const hasMatch = desktopsEnv.split(':').some(desktop => desktop === name);
    _currentDesktopsMatches[name] = hasMatch;
    return hasMatch;
}

function getClubhouseApp(clubhouseId = 'com.hack_computer.Clubhouse') {
    return Shell.AppSystem.get_default().lookup_app(`${clubhouseId}.desktop`);
}

// This function will query if the extension is loaded and then
// run the callback function.
function waitForExtension(extension, callback) {
    const waitTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        if (runWithExtension(extension, callback)) {
            return GLib.SOURCE_REMOVE;
        }

        return GLib.SOURCE_CONTINUE;
    });

    return waitTimeoutId;
}

function runWithExtension(extension, callback) {
    const loaded = Main.extensionManager.lookup(extension);
    if (!loaded) {
        return false;
    }

    callback(loaded);
    return true;
}

// Looks for old clubhouse system modifications and reset to the EOS default.
// This only works on endless desktop and it's to ease the migration from
// EOS 3.8 to EOS 3.9.
//
// This is needed because the old clubhouse changes the user background and the
// cursor-theme on the first run.
function resetHackMods() {
    if (!desktopIs('endless'))
        return;

    let settings = Gio.Settings.new('org.gnome.desktop.background');
    const clubhouseBG = 'file:///var/lib/flatpak/app/com.hack_computer.Clubhouse';
    const bg = settings.get_string('picture-uri');

    if (bg.startsWith(clubhouseBG))
        settings.reset('picture-uri');

    settings = Gio.Settings.new('org.gnome.desktop.interface');
    if (settings.get_string('cursor-theme') === 'cursor-hack')
        settings.reset('cursor-theme');
}
