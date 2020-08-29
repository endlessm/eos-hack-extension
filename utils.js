/* exported getSettings, loadInterfaceXML, override, overrideProperty, restore, original, tryMigrateSettings, ObjectsMap, gettext, desktopIs, getClubhouseApp */

const {Gio, GLib, Shell} = imports.gi;
const {config} = imports.misc;
const Gettext = imports.gettext.domain('hack-extension');
const Extension = imports.misc.extensionUtils.getCurrentExtension();

var {gettext} = Gettext;

function getMigrationSettings() {
    const dir = Extension.dir.get_child('migration').get_path();
    const source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(), false);

    if (!source)
        throw new Error('Error Initializing the thingy.');

    const schema = source.lookup('org.gnome.shell', false);

    if (!schema)
        throw new Error('Schema missing.');

    return new Gio.Settings({settings_schema: schema});
}

function getSettings() {
    const dir = Extension.dir.get_child('schemas').get_path();
    const source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(), false);

    if (!source)
        throw new Error('Error Initializing the thingy.');

    const schema = source.lookup('com.endlessm.hack-extension', false);

    if (!schema)
        throw new Error('Schema missing.');

    return new Gio.Settings({settings_schema: schema});
}

function tryMigrateSettings() {
    const settings = getSettings();
    if (settings.get_boolean('hack-settings-migrated'))
        return;

    const oldSettings = getMigrationSettings();
    const boolSettings = [
        'hack-mode-enabled',
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

    boolSettings.forEach(k => {
        settings.set_boolean(k, oldSettings.get_boolean(k));
    });
    floatSettings.forEach(k => {
        settings.set_double(k, oldSettings.get_double(k));
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
function desktopIs(name, maxVersion = '3.36') {
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
