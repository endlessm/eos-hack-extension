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

// Translation support
const Gettext = imports.gettext;

Gettext.textdomain("eos-hack@endlessm.com");
Gettext.bindtextdomain("eos-hack@endlessm.com", ExtensionSystem.extensionMeta["eos-hack@endlessm.com"].path + "/locale");

const _ = Gettext.gettext;

// To import custom files
const { appDisplay, clubhouse, codeView } = Hack.imports.ui;
const { tryMigrateSettings } = Hack.imports.utils;
const Service = Hack.imports.service;

function enable() {
    tryMigrateSettings();

    appDisplay.enable();
    clubhouse.enable();
    codeView.enable();

    Service.enable();
}

function disable() {
    appDisplay.disable();
    clubhouse.disable();
    codeView.disable();

    Service.disable();
}
