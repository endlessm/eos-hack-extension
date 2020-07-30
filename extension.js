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
const {ui} = Hack.imports;
const {tryMigrateSettings, desktopIs} = Hack.imports.utils;
const Service = Hack.imports.service;

function enable() {
    tryMigrateSettings();

    // Only enable if we're in EOS
    if (desktopIs('endless')) {
        // Hack desktop icon
        ui.appDisplay.enable();
    }
    // Hack clubhouse desktop notifications
    ui.clubhouse.enable();

    // Flip to hack
    ui.codeView.enable();

    // DBus API
    Service.enable();
}

function disable() {
    if (desktopIs('endless'))
        ui.appDisplay.disable();

    ui.clubhouse.disable();
    ui.codeView.disable();

    Service.disable();
}
