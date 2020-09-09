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
