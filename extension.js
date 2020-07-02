/* exported enable, disable */
/*
 * Copyright 2020 Endless, Inc
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();

// To import custom files
const { ui } = Hack.imports;
const { tryMigrateSettings, is } = Hack.imports.utils;
const Service = Hack.imports.service;

function enable() {
    tryMigrateSettings();

    // Only enable if we're in EOS
    if (is('endless')) {
        // Hack desktop icon
        ui.appDisplay.enable();
        // Hack clubhouse desktop notifications
        ui.clubhouse.enable();
    }
    // Flip to hack
    ui.codeView.enable();

    // DBus API
    Service.enable();
}

function disable() {
    if (is('endless')) {
        ui.appDisplay.disable();
        ui.clubhouse.disable();
    }
    ui.codeView.disable();

    Service.disable();
}
