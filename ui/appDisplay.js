/* exported enable, disable */
/* global global */

const AppDisplay = imports.ui.appDisplay;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Utils = Hack.imports.utils;

var CLUBHOUSE = 'com.hack_computer.Clubhouse.desktop';

function enable() {
    Utils.override(AppDisplay.PageManager, '_loadPages', function() {
        const layout = global.settings.get_value('app-picker-layout');
        const pages = layout.recursiveUnpack();

        // Add hack icon to the first page
        const desktop = pages[0];

        // Reposition clubhouse if it's on desktop
        if (CLUBHOUSE in desktop) {
            const clubhouse = desktop[CLUBHOUSE];

            if (clubhouse.position !== 0) {
                const pos = clubhouse.position;
                Object.keys(desktop).forEach(k => {
                    const kpos = desktop[k].position;
                    if (k === CLUBHOUSE) {
                        desktop[k].position = 0;
                    } else if (kpos < pos) {
                        desktop[k].position = kpos + 1;
                    }
                });
            }
        } else {
            // Add the clubhouse app
            Object.keys(desktop).forEach(k => {
                desktop[k].position = desktop[k].position + 1;
            });
            desktop[CLUBHOUSE] = { position: 0 };
        }

        this._pages = pages;
        if (!this._updatingPages)
            this.emit('layout-changed');
    });

    Main.overview.viewSelector.appDisplay._pageManager._loadPages();
}

function disable() {
    Utils.restore(AppDisplay.PageManager);
}
