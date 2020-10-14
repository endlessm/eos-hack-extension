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
/* global global */

const {Clutter, Flatpak, Gio, GLib, GObject, Graphene, Json, Pango, St} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Hack = ExtensionUtils.getCurrentExtension();
const Settings = Hack.imports.utils.getSettings();
const Utils = Hack.imports.utils;

const {Animation} = imports.ui.animation;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const MessageList = imports.ui.messageList;
const Layout = imports.ui.layout;
const NotificationDaemon = imports.ui.notificationDaemon;

const Util = imports.misc.util;

const Soundable = Hack.imports.ui.soundable;
const SoundServer = Hack.imports.misc.soundServer;

const {GtkNotificationDaemon} = NotificationDaemon;

const CLUBHOUSE_BANNER_ANIMATION_TIME = 200;

// This margin is used to position the banner relative to the top-left
// or bottom-left corners of the screen.
const CLUBHOUSE_BANNER_MARGIN = 30;

const CLUBHOUSE_DBUS_OBJ_PATH = '/com/hack_computer/Clubhouse';
const ClubhouseIface = Utils.loadInterfaceXML('com.hack_computer.Clubhouse');

// Some button labels are replaced by customized icons if they match a
// unicode emoji character, as per Design request.
const CLUBHOUSE_ICONS_FOR_EMOJI = {
    '❯': 'clubhouse-notification-button-next-symbolic.svg',
    '❮': 'clubhouse-notification-button-previous-symbolic.svg',
    '👍': 'clubhouse-thumbsup-symbolic.svg',
    '👎': 'clubhouse-thumbsdown-symbolic.svg',
};

var ClubhouseAnimation =  GObject.registerClass(
class ClubhouseAnimation extends Animation {
    _init(file, width, height, defaultDelay, frames) {
        const speed = defaultDelay || 200;
        super._init(file, width, height, speed);

        this._frameIndex = 0;
        this._framesInfo = [];

        if (frames)
            this.setFramesInfo(this._parseFrames(frames));
    }

    play() {
        if (this._isLoaded && this._timeoutId === 0) {
            // Set the frame to be the previous one, so when we update it
            // when play is called, it shows the current frame instead of
            // the next one.
            if (this._frameIndex === 0)
                this._frameIndex = this._framesInfo.length - 1;
            else
                this._frameIndex -= 1;

            this._update();
        }

        this._isPlaying = true;
    }

    _showFrame(frame) {
        const oldFrameActor = this._getCurrentFrameActor();
        if (oldFrameActor)
            oldFrameActor.hide();

        this._frameIndex = frame % this._framesInfo.length;

        const newFrameActor = this._getCurrentFrameActor();
        if (newFrameActor)
            newFrameActor.show();
    }

    _syncAnimationSize() {
        super._syncAnimationSize();
        if (this._isLoaded && this._framesInfo.length === 0) {
            // If a custom sequence of frames wasn't provided,
            // fallback to play the frames in sequence.
            for (let i = 0; i < this._animations.get_n_children(); i++)
                this._framesInfo.push({frameIndex: i, frameDelay: this._speed});
        }
    }

    _update() {
        this._showFrame(this._frameIndex + 1);

        // Show the next frame after the timeout of the current one
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_LOW, this._getCurrentDelay(),
            this._update.bind(this));

        GLib.Source.set_name_by_id(this._timeoutId, '[gnome-shell] this._update');

        return GLib.SOURCE_REMOVE;
    }

    _getCurrentFrame() {
        return this._framesInfo[this._frameIndex];
    }

    _getCurrentFrameActor() {
        const currentFrame = this._getCurrentFrame();
        return this._animations.get_child_at_index(currentFrame.frameIndex);
    }

    setFramesInfo(framesInfo) {
        const wasPlaying = this._isPlaying;
        this.stop();

        this._framesInfo = framesInfo;

        // If the animation was playing, we continue to play it here
        // (where it will use the new frames)
        if (wasPlaying)
            this.play();
    }

    _getCurrentDelay() {
        const currentFrame = this._getCurrentFrame();
        const delay = currentFrame.frameDelay;
        if (typeof delay === 'string') {
            const [delayA, delayB] = delay.split('-');
            return GLib.random_int_range(parseInt(delayA, 10), parseInt(delayB, 10));
        }
        return delay;
    }

    _parseFrame(frame) {
        if (typeof frame === 'string') {
            let [frameIndex, frameDelay] = frame.split(' ');
            frameIndex = parseInt(frameIndex, 10);

            if (frameDelay.indexOf('-') === -1)
                frameDelay = parseInt(frameDelay, 10);

            return [frameIndex, frameDelay];
        }
        return [frame, this._speed];
    }

    _parseFrames(frames) {
        const framesInfo = [];
        for (const frameInfo of frames) {
            const [frameIndex, frameDelay] = this._parseFrame(frameInfo);
            framesInfo.push({frameIndex, frameDelay});
        }
        return framesInfo;
    }
});

var ClubhouseAnimator =
class ClubhouseAnimator {
    constructor(proxy, clubhouseId) {
        this._proxy = proxy;
        this._animations = {};
        this._clubhouseId = clubhouseId;
        this._clubhousePaths = this._getClubhousePaths();
    }

    _getClubhousePaths() {
        const paths = [];
        let installations = [];

        try {
            installations = Flatpak.get_system_installations(null);
        } catch (err) {
            logError(err, 'Error while getting Flatpak system installations');
        }

        let userInstallation = null;
        try {
            userInstallation = Flatpak.Installation.new_user(null);
        } catch (err) {
            logError(err, 'Error while getting Flatpak user installation');
        }

        if (userInstallation)
            installations.unshift(userInstallation);

        for (const installation of installations) {
            let app = null;
            try {
                app = installation.get_current_installed_app(this._clubhouseId, null);
            } catch (err) {
                if (!err.matches(Flatpak.Error, Flatpak.Error.NOT_INSTALLED))
                    logError(err, 'Error while getting installed %s'.format(this._clubhouseId));

                continue;
            }

            if (app) {
                const deployDir = app.get_deploy_dir();
                paths.push(this._getActivateDir(deployDir));
            }
        }

        return paths;
    }

    _getActivateDir(deployDir) {
        // Replace the hash part of the deploy directory by "active", so the directory
        // is always the most recent one (i.e. allows us to update the Clubhouse and
        // still have the right dir).
        const dir = deployDir.substr(-1) === '/' ? deployDir.slice(0, -1) : deployDir;
        const splitDir = dir.split('/');

        splitDir[splitDir.length - 1] = 'active';

        return splitDir.join('/');
    }

    _getClubhousePath(path, retry = true) {
        // Discard the /app/ prefix
        const pathSuffix = path.replace(/^\/app\//g, '');

        for (const p of this._clubhousePaths) {
            const completePath = GLib.build_filenamev([p, 'files', pathSuffix]);
            if (GLib.file_test(completePath, GLib.FileTest.EXISTS))
                return completePath;
        }

        // retrying reloading clubhouse paths
        if (retry) {
            this._clubhousePaths = this._getClubhousePaths();
            return this._getClubhousePath(path, false);
        }

        return null;
    }

    _loadAnimationByPath(path, callback) {
        const metadata = this._animations[path];
        if (metadata) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                callback(metadata);
                return GLib.SOURCE_REMOVE;
            });

            return;
        }

        this._proxy.getAnimationMetadataRemote(path, (results, err) => {
            if (err) {
                logError(err, 'Error getting animation metadata json');
                callback(null);
                return;
            }

            const [metadataVariant] = results;
            const jsonData = Json.gvariant_serialize(metadataVariant);
            const jsonStr = Json.to_string(jsonData, false);
            const mdata = JSON.parse(jsonStr);
            this._animations[path] = mdata;

            callback(mdata);
        });
    }

    clearCache() {
        this._animations = {};
    }

    getAnimation(path, callback) {
        this._loadAnimationByPath(path, metadata => {
            if (!metadata) {
                callback(null);
                return;
            }

            const realPath = this._getClubhousePath(path);
            const animation = new ClubhouseAnimation(Gio.File.new_for_path(realPath),
                metadata.width,
                metadata.height,
                metadata['default-delay'],
                metadata.frames);
            callback(animation);
        });
    }
};

var QuestBannerPosition =
class QuestBannerPosition {
    constructor() {
        this._atBottom = false;
    }

    get atBottom() {
        return this._atBottom;
    }

    set atBottom(bool) {
        this._atBottom = bool;
    }

    toggle() {
        this.atBottom = !this.atBottom;
    }
};

var ClubhouseNotificationBanner = GObject.registerClass(
class ClubhouseNotificationBanner extends MessageTray.NotificationBanner {
    _init(notification) {
        super._init(notification);
        this._bodySimpleMarkup = true;

        // Whether it should animate when positioning it
        this._shouldSlideIn = true;

        // We don't have an "unexpanded" state for now
        this.expand(false);
        this._actionBin.visible = true;

        this.can_focus = true;
        this.track_hover = true;

        // Override the style name because this is a not a regular notification
        this.remove_style_class_name('notification-banner');
        this.add_style_class_name('clubhouse-notification');
        this._iconBin.add_style_class_name('clubhouse-notification-icon-bin');
        this._closeButton.add_style_class_name('clubhouse-notification-close-button');

        // Always wrap the body's text
        this._expandedLabel.add_style_class_name('clubhouse-notification-label');

        this._rearrangeElements();

        this._closeButton.connect('clicked', () => {
            SoundServer.getDefault().play('clubhouse/dialog/close');
        });

        this.setUseBodyMarkup(true);
        this.setUseBodySimpleMarkup(false);

        this._setNextPage();

        if (this._textPages.length > 1)
            this._setupNextPageButton();
    }

    setBody(text) {
        if (this._paginationReady) {
            super.setBody(text);
        } else {
            // if the pagination is not initialized we do the initialization here
            // this method will be called again by _setNextPage() with the first page
            super.setBody('');
            this._splitTextInPages(text);
            this._paginationReady = true;
        }
    }

    setIcon(actor) {
        actor.add_style_class_name('clubhouse-notification-image');
        const actorParams = {
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END,
        };
        Object.assign(actor, actorParams);
        super.setIcon(actor);
    }

    _rearrangeElements() {
        // This overrides the custom layout manager that provokes
        // size/allocation issues:
        this._bodyStack.layout_manager = new Clutter.FixedLayout();

        const contentBox = this._bodyStack.get_parent();
        contentBox.add_style_class_name('clubhouse-content-box');
        const hbox = contentBox.get_parent();
        const vbox = hbox.get_parent();

        const wrapBin = new St.Bin({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            y_expand: true,
        });
        hbox.add_child(wrapBin);

        // A Clutter.BinLayout is used to rearrange the notification
        // elements in layers:
        const wrapWidget = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
        });
        wrapBin.set_child(wrapWidget);

        const bodyStackParams = {
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        };
        Object.assign(this._bodyStack, bodyStackParams);

        const secondaryBinParams = {
            x_align: St.Align.END,
        };
        Object.assign(this._secondaryBin, secondaryBinParams);

        const iconBinParams = {
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        };
        Object.assign(this._iconBin, iconBinParams);

        const contentBoxParams = {
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
        };
        Object.assign(contentBox, contentBoxParams);

        const actionBinParams = {
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.END,
        };
        Object.assign(this._actionBin, actionBinParams);

        const expandedLabelActorParams = {
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        };
        Object.assign(this._expandedLabel, expandedLabelActorParams);
        this._expandedLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._expandedLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        hbox.remove_child(contentBox);
        wrapWidget.add_child(contentBox);

        hbox.remove_child(this._iconBin);
        wrapWidget.add_child(this._iconBin);

        vbox.remove_child(this._actionBin);
        wrapWidget.add_child(this._actionBin);
    }

    // Override the callback that changes the button opacity on hover:
    _sync() {
        this._closeButton.opacity = 255;
    }

    _updateButtonsCss() {
        if (!this._buttonBox || this._buttonBox.get_children().length === 0) {
            this.remove_style_class_name('with-buttons');
            return;
        }

        this.add_style_class_name('with-buttons');

        // @todo: This is a workaround for the missing CSS selector, :nth-child
        // Upstream issue: https://gitlab.gnome.org/GNOME/gnome-shell/issues/1800
        this._buttonBox.get_children().forEach((button, index) => {
            const nthClass = `child-${index + 1}`;
            const classList = button.get_style_class_name();
            if (classList.match(/child-[0-9]*/))
                button.set_style_class_name(classList.replace(/child-[0-9]*/, nthClass));
            else
                button.set_style_class_name(`${classList} ${nthClass}`);
        });
    }

    _addActions() {
        // Only set up the actions if we're showing the last page of text
        if (!this._inLastPage())
            return;

        super._addActions();
        this._updateButtonsCss();
    }

    // Override this method because we don't want the button
    // horizontally expanded:
    addButton(button, callback) {
        if (Object.keys(CLUBHOUSE_ICONS_FOR_EMOJI).includes(button.label)) {
            const icon = CLUBHOUSE_ICONS_FOR_EMOJI[button.label];
            const iconUrl = `file://${Hack.path}/data/icons/${icon}`;
            button.label = '';

            button.add_style_class_name('icon-button');
            const iconFile = Gio.File.new_for_uri(iconUrl);
            const gicon = new Gio.FileIcon({file: iconFile});
            button.child = new St.Icon({gicon});
        } else {
            button.add_style_class_name('text-button');
        }

        button.set_x_expand(false);
        super.addButton(button, callback);
    }

    _splitTextInPages(fulltext) {
        this._textIdx = -1;
        // @todo: Ensure that paragraphs longer than 5 lines (in the banner) is also split up
        this._textPages = fulltext.split('\n\n');
    }

    _repositionY() {
        this.y = CLUBHOUSE_BANNER_MARGIN;
    }

    reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        this.x = monitor.x + monitor.width;

        const endX = this.x - this.width - CLUBHOUSE_BANNER_MARGIN;

        if (this._shouldSlideIn) {
            // If the banner is still sliding in, stop it (because we have a new position for it).
            // This should prevent the banner from not being set in the right position when the
            // Clubhouse is hidden while the banner is still sliding in.
            this.remove_all_transitions();

            // clipping the actor to avoid appearing in the right monitor
            const endClip = new Graphene.Rect({
                origin: new Graphene.Point({x: 0, y: 0}),
                size: new Graphene.Size({
                    width: this.width + CLUBHOUSE_BANNER_MARGIN,
                    height: this.height,
                }),
            });
            this.set_clip(0, 0, 0, this.height);

            this.ease({
                x: endX,
                duration: CLUBHOUSE_BANNER_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._shouldSlideIn = false;
                },
            });
            this.ease_property('clip-rect', endClip, {
                duration: CLUBHOUSE_BANNER_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.remove_clip(),
            });
        } else {
            this.x = endX;
        }

        this._repositionY();
    }


    vfunc_clicked() {
        // Do nothing because we don't want to activate the Clubhouse ATM
    }

    _setNextPage() {
        if (this._inLastPage())
            return;

        this.setBody(this._textPages[++this._textIdx]);
        if (this._inLastPage())
            this._addActions();
    }

    _inLastPage() {
        return this._textIdx === this._textPages.length - 1;
    }

    _setupNextPageButton() {
        const button = new Soundable.Button({
            style_class: 'notification-button',
            label: '❯',
            can_focus: true,
            click_sound_event_id: 'clubhouse/dialog/next',
        });

        this.addButton(button, () => {
            this._setNextPage();

            if (this._inLastPage()) {
                button.destroy();
                this._updateButtonsCss();
            }
        });

        this._updateButtonsCss();
    }

    _slideOut() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            this.destroy();
            return;
        }

        const endX = monitor.x + monitor.width;

        // clipping the actor to avoid appearing in the right monitor
        const endClip = new Graphene.Rect({
            origin: new Graphene.Point({x: 0, y: 0}),
            size: new Graphene.Size({
                width: 0,
                height: this.height,
            }),
        });
        this.set_clip(0, 0, this.width + CLUBHOUSE_BANNER_MARGIN, this.height);

        this.ease({
            x: endX,
            clip: endClip,
            duration: CLUBHOUSE_BANNER_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.destroy();
            },
        });
        this.ease_property('clip-rect', endClip, {
            duration: CLUBHOUSE_BANNER_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    dismiss(shouldSlideOut) {
        if (shouldSlideOut) {
            this._slideOut();
            return;
        }

        this.destroy();
    }
});

var ClubhouseQuestBanner = GObject.registerClass(
class ClubhouseQuestBanner extends ClubhouseNotificationBanner {
    _init(notification, isFirstBanner, animator, position, callback) {
        const icon = notification.gicon;
        let imagePath = null;

        if (icon instanceof Gio.FileIcon) {
            const file = icon.get_file();
            imagePath = file.get_path();
            notification.gicon = null;
        }

        super._init(notification);

        this._upDownIcon = null;
        this._setupUpDownButton();

        this._shouldSlideIn = isFirstBanner;
        this._position = position;
        this._bottomBanner = null;

        this._closeButton.visible = notification.urgency !== MessageTray.Urgency.CRITICAL;

        if (imagePath) {
            animator.getAnimation(imagePath, animation => {
                if (!animation)
                    return;

                animation.play();
                this.setIcon(animation);
                callback(this);
            });
        }
    }

    setBottomBanner(bottomBanner) {
        this._bottomBanner = bottomBanner;
    }

    _updateUpDownIcon() {
        if (!this._upDownIcon)
            return;

        if (this._position.atBottom)
            this._upDownIcon.icon_name = 'go-top-symbolic';
        else
            this._upDownIcon.icon_name = 'go-bottom-symbolic';
    }

    _setupUpDownButton() {
        this._upDownIcon = new St.Icon({
            icon_name: 'go-bottom-symbolic',
            icon_size: 16,
        });
        let upDownButton = new Soundable.Button({
            style_class: 'clubhouse-notification-updown-button',
            child: this._upDownIcon,
            click_sound_event_id: 'clubhouse/entry/close',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._secondaryBin.add_actor(upDownButton);

        this.connect('notify::hover', () => {
            if (this.get_hover())
                upDownButton.add_style_class_name('visible');
            else
                upDownButton.remove_style_class_name('visible');
        });

        upDownButton.connect('clicked', () => {
            this._slideUpDown();
        });
    }

    _getPositionY(atBottom) {
        if (atBottom) {
            let monitor = Main.layoutManager.primaryMonitor;
            if (!monitor)
                return 0;

            return monitor.y + monitor.height -
                   this.height - CLUBHOUSE_BANNER_MARGIN -
                   Main.panel.get_height();
        } else {
            return CLUBHOUSE_BANNER_MARGIN;
        }
    }

    _slideUpDown() {
        this.ease({
            // Note, we pass the opposite position because we are
            // toggling direction:
            y: this._getPositionY(!this._position.atBottom),
            duration: CLUBHOUSE_BANNER_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._position.toggle();
                this._updateUpDownIcon();
                if (this._bottomBanner && this._bottomBanner)
                    this._bottomBanner.reposition();
            },
        });
    }

    _repositionY() {
        this.y = this._getPositionY(this._position.atBottom);
    }

    reposition() {
        super.reposition();
        this._updateUpDownIcon();
    }
});

var ClubhouseItemBanner = GObject.registerClass(
class ClubhouseItemBanner extends ClubhouseNotificationBanner {
    _init(notification, callback) {
        super._init(notification);
        this.add_style_class_name('clubhouse-item-notification');
        this._topBanner = null;
        callback(this);
    }

    setTopBanner(topBanner) {
        this._topBanner = topBanner;
        this.reposition();
    }

    _repositionY() {
        if (this._topBanner && !this._topBanner._position.atBottom)
            this.y += this._topBanner.height;
        else
            super._repositionY();
    }
});

var ClubhouseNotification = GObject.registerClass(
class ClubhouseNotification extends NotificationDaemon.GtkNotificationDaemonNotification {
    _init(source, notification) {
        super._init(source, notification);

        this.notificationId = notification.notificationId.unpack();

        // Avoid destroying the notification when clicking it
        this.setResident(true);
    }

    createBanner(isFirstBanner, animator, position, callback) {
        return new ClubhouseQuestBanner(this, isFirstBanner, animator, position, callback);
    }
});

var ClubhouseItemNotification = GObject.registerClass(
class ClubhouseItemNotification extends ClubhouseNotification {
    _init(source, notification) {
        super._init(source, notification);
        this.setResident(false);
    }

    createBanner(callback) {
        return new ClubhouseItemBanner(this, callback);
    }
});

var ClubhouseNotificationSource = GObject.registerClass(
class ClubhouseNotificationSource extends NotificationDaemon.GtkNotificationDaemonAppSource {
    _createNotification(params) {
        const notificationId = params.notificationId.unpack();

        if (notificationId === 'quest-item')
            return new ClubhouseItemNotification(this, params);

        return new ClubhouseNotification(this, params);
    }

    activateAction(actionId, target) {
        // Never show the overview when calling an action on this source.
        this.activateActionFull(actionId, target, false);
    }
});

var Component = GObject.registerClass({
}, class ClubhouseComponent extends GObject.Object {
    _init(clubhouseIface, clubhouseId, clubhousePath) {
        this._clubhouseId = clubhouseId || 'com.hack_computer.Clubhouse';
        this._clubhouseIface = clubhouseIface || ClubhouseIface;
        this._clubhousePath = clubhousePath || CLUBHOUSE_DBUS_OBJ_PATH;
        this._proxyInfo = Gio.DBusInterfaceInfo.new_for_xml(this._clubhouseIface);

        this._enabled = false;
        this._hasForegroundQuest = false;

        this._questBanner = null;
        this._itemBanner = null;
        this._clubhouseSource = null;
        this._clubhouseProxyHandler = 0;

        this._clubhouseAnimator = null;
        this._questBannerPosition = null;

        this._overrideAddNotification();
    }

    get _useClubhouse() {
        return !!this.getClubhouseApp();
    }

    getClubhouseApp() {
        return Utils.getClubhouseApp(this._clubhouseId);
    }

    _migrationQuest() {
        // Check if the old HackComponents flatpak is installed, in that case,
        // this is an old hack computer so we can launch the migration Quest.
        // The new clubhouse will do the check and will only launch the quest once,
        // so we can do the call every time.
        const hackComponents = Gio.File.new_for_uri('file:///var/lib/flatpak/app/com.endlessm.HackComponents');
        if (hackComponents.query_exists(null)) {
            this.proxy.call('migrationQuest', null, Gio.DBusCallFlags.NONE, -1, null, (source, result) => {
                try {
                    this.proxy.call_finish(result);
                    log('Hack 1 migration: migration quest started');
                } catch (err) {
                    logError(err, 'Hack 1 migration: migration quest could not be started');
                }
            });
        }
    }

    async _ensureProxy() {
        if (this.proxy)
            return this.proxy;

        if (!this._cancellable)
            this._cancellable = new Gio.Cancellable();

        const clubhouseInstalled = !!this.getClubhouseApp();
        if (clubhouseInstalled) {
            try {
                this.proxy = new Gio.DBusProxy({
                    g_connection: Gio.DBus.session,
                    g_interface_name: this._proxyInfo.name,
                    g_interface_info: this._proxyInfo,
                    g_name: this._clubhouseId,
                    g_object_path: this._clubhousePath,
                    g_flags: Gio.DBusProxyFlags.NONE,
                });
                await this.proxy.init_async(
                    GLib.PRIORITY_DEFAULT, this._cancellable);
                return this.proxy;
            } catch (e) {
                logError(e, `Error while constructing the DBus proxy for ${this._proxyName}`);
            }
        } else {
            log('Cannot construct Clubhouse proxy because Clubhouse app was not found.');
        }
        return null;
    }

    enable() {
        if (!this._useClubhouse) {
            log('Cannot enable Clubhouse in this image version');
            return;
        }

        this._ensureProxy();
        this._migrationQuest();

        if (this._clubhouseProxyHandler === 0) {
            this._clubhouseProxyHandler = this.proxy.connect('notify::g-name-owner', () => {
                if (!this.proxy.g_name_owner) {
                    log('Nothing owning D-Bus name %s, so dismiss the Clubhouse banner'.format(this._clubhouseId));
                    this._clearQuestBanner();

                    // Clear the animator cache, so we reload the metadata files the next time
                    // an animation is used, thus accounting for an eventual Clubhouse update
                    // in the meantime which may bring metadata changes for the animations.
                    if (this._clubhouseAnimator !== null)
                        this._clubhouseAnimator.clearCache();
                }
            });

            this._clubhouseAnimator = new ClubhouseAnimator(this.proxy, this._clubhouseId);
            this._questBannerPosition = new QuestBannerPosition();
        }

        this._enabled = true;
        this._syncVisibility();
    }

    disable() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        this._enabled = false;
        this._syncVisibility();
    }

    callShow(timestamp) {
        if (this._ensureProxy() && this.proxy.g_name_owner) {
            this.proxy.showRemote(timestamp);
            return;
        }

        // We only activate the app here if it's not yet running, otherwise the cursor will turn
        // into a spinner for a while, even after the window is shown.
        // @todo: Call activate alone when we fix the problem mentioned above.
        this.getClubhouseApp().activate();
    }

    callHide(timestamp) {
        this.proxy.hideRemote(timestamp);
    }

    _getClubhouseSource() {
        if (this._clubhouseSource !== null)
            return this._clubhouseSource;

        this._clubhouseSource = new ClubhouseNotificationSource(this._clubhouseId);
        this._clubhouseSource.connect('notification-show', this._onNotify.bind(this));
        this._clubhouseSource.connect('destroy', () => {
            this._clubhouseSource = null;
        });

        return this._clubhouseSource;
    }

    _syncBanners() {
        if (this._itemBanner)
            this._itemBanner.setTopBanner(this._questBanner);
        if (this._questBanner)
            this._questBanner.setBottomBanner(this._itemBanner);
    }

    _clearQuestBanner() {
        if (!this._questBanner)
            return;

        this._questBanner.dismiss(!this._hasForegroundQuest);

        this._questBanner = null;

        this._syncBanners();
    }

    _clearItemBanner() {
        if (!this._itemBanner)
            return;

        this._itemBanner.dismiss(true);
        this._itemBanner = null;
        this._syncBanners();
    }

    _overrideAddNotification() {
        const oldAddNotificationFunc = GtkNotificationDaemon.prototype.AddNotificationAsync;
        GtkNotificationDaemon.prototype.AddNotificationAsync = (params, invocation) => {
            const [appId, notificationId, notification] = params;

            // If the app sending the notification is the Clubhouse, then use our own source
            if (appId === this._clubhouseId) {
                notification['notificationId'] = new GLib.Variant('s', notificationId);
                this._getClubhouseSource().addNotification(notificationId, notification, true);
                invocation.return_value(null);
                return;
            }

            oldAddNotificationFunc.apply(Main.notificationDaemon._gtkNotificationDaemon,
                [params, invocation]);
        };

        const oldRemoveNotificationFunc = GtkNotificationDaemon.prototype.RemoveNotificationAsync;
        GtkNotificationDaemon.prototype.RemoveNotificationAsync = (params, invocation) => {
            const [appId, notificationId] = params;

            // If the app sending the notification is the Clubhouse, then use our own source
            if (appId === this._clubhouseId) {
                this._getClubhouseSource().removeNotification(notificationId);
                invocation.return_value(null);
                return;
            }

            oldRemoveNotificationFunc.apply(Main.notificationDaemon._gtkNotificationDaemon,
                [params, invocation]);
        };
    }

    _onNotify(source, notification) {
        // @todo: Abstract the banner logic into the notifications themselves as much as possible
        // (to just keep track of when they're destroyed).
        const notificationId = notification.serialize().deep_unpack().notificationId.unpack();

        if (notificationId === 'quest-message') {
            notification.connect('destroy', (n, reason) => {
                if (reason !== MessageTray.NotificationDestroyedReason.REPLACED &&
                    reason !== MessageTray.NotificationDestroyedReason.SOURCE_CLOSED)
                    this._dismissQuestBanner(n.source);

                this._clearQuestBanner();
            });

            if (!this._questBanner) {
                this._questBanner = notification.createBanner(!this._hasForegroundQuest,
                    this._clubhouseAnimator, this._questBannerPosition, banner => {
                        Main.layoutManager.addChrome(banner);
                        banner.reposition();
                        if (this._itemBanner)
                            this._itemBanner.reposition();
                    });
                this._hasForegroundQuest = true;
            }
        } else if (notificationId === 'quest-item') {
            notification.connect('destroy', (_notification, _reason) => {
                this._clearItemBanner();
            });

            if (!this._itemBanner) {
                this._itemBanner = notification.createBanner(banner => {
                    Main.layoutManager.addChrome(banner);
                    banner.reposition();
                    if (this._questBanner)
                        this._questBanner.reposition();
                });
            }
        }

        this._syncBanners();

        // Sync the visibility here because the screen may be locked when a notification
        // happens
        this._syncVisibility();
    }

    _dismissQuestBanner(source) {
        // Inform the Clubhouse that the quest banner has been dismissed
        if (this.proxy.g_name_owner)
            source.activateAction('quest-view-close', null);

        this._hasForegroundQuest = false;
    }

    _syncVisibility() {
        if (this._questBanner)
            this._questBanner.visible = this._enabled;

        if (this._itemBanner)
            this._itemBanner.visible = this._enabled;
    }
});

// Monkey patching

// rich markup
function _fixMarkup(text, allowMarkup, onlySimpleMarkup) {
    if (allowMarkup) {
        // Support &amp;, &quot;, &apos;, &lt; and &gt;, escape all other
        // occurrences of '&'.
        let _text = text.replace(/&(?!amp;|quot;|apos;|lt;|gt;)/g, '&amp;');

        if (onlySimpleMarkup) {
            // Support <b>, <i>, and <u>, escape anything else
            // so it displays as raw markup.
            // Ref: https://developer.gnome.org/notification-spec/#markup
            _text = _text.replace(/<(?!\/?[biu]>)/g, '&lt;');
        }

        try {
            Pango.parse_markup(_text, -1, '');
            return _text;
        } catch (e) {}
    }

    // !allowMarkup, or invalid markup
    return GLib.markup_escape_text(text, -1);
}

function setBody(text) {
    this._bodyText = text;
    this.bodyLabel.setMarkup(text ? text.replace(/\n/g, ' ') : '',
        this._useBodyMarkup, !!this._bodySimpleMarkup);

    if (this._expandedLabel) {
        this._expandedLabel.text = '';
        this._expandedLabel.setMarkup(text, this._useBodyMarkup, !!this._bodySimpleMarkup);
    }
}

function setUseBodySimpleMarkup(activate) {
    if (!!this._bodySimpleMarkup === activate)
        return;
    this._bodySimpleMarkup = activate;
    if (this.bodyLabel)
        this.setBody(this._bodyText);
}

function setMarkup(text, allowMarkup, onlySimpleMarkup = true) {
    this._text = text ? _fixMarkup(text, allowMarkup, onlySimpleMarkup) : '';

    this.clutter_text.set_markup(this._text);

    /* clutter_text.text contain text without markup */
    this._urls = Util.findUrls(this.clutter_text.text);
    this._highlightUrls();
}

function activateAction(actionId, target) {
    this.activateActionFull(actionId, target, true);
}

function activateActionFull(actionId, target, hideOverview) {
    this._createApp((app, error) => {
        if (error === null) {
            app.ActivateActionRemote(actionId, target ? [target] : [],
                NotificationDaemon.getPlatformData());
        } else {
            logError(error, 'Failed to activate application proxy');
        }
    });

    if (hideOverview) {
        Main.overview.hide();
        Main.panel.closeCalendar();
    }
}

var CLUBHOUSE = null;
var NOTIFY_CLONE = null;
var MAP_WINDOW_HANDLER = null;
var DESTROY_WINDOW_HANDLER = null;
var SHOW_OVERVIEW_HANDLER = null;
var HIDE_OVERVIEW_HANDLER = null;
var ONBOARDING_HL_HANDLER = null;
var ONBOARDING_PROXY = null;
var ONBOARDING_CANCELLABLE = null;

function _destroyNotifyClone() {
    if (NOTIFY_CLONE) {
        NOTIFY_CLONE.destroy();
        NOTIFY_CLONE = null;
    }
}

function mapNotifyWindow(win, actor, forceClone = false) {
    if (!win || win.get_role() !== 'clubhouse-msg-notify')
        return;

    if (!Main.overview.visible && !forceClone)
        return;

    _destroyNotifyClone();

    const cloneActor = new Clutter.Clone({
        source: actor,
        width: actor.width,
        height: actor.height,
        x: actor.x,
        y: actor.y,
        reactive: true,
    });

    cloneActor.connect('button-press-event', (actor, ev, data) => {
        const [x, y] = ev.get_coords();
        const actorX = x - cloneActor.x;
        const actorY = y - cloneActor.y;
        CLUBHOUSE.proxy.notificationEventRemote(actorX, actorY, (results, err) => {
            if (err)
                logError(err, 'Error sending click event to clubhouse');
        });
    });

    const positionHandler = win.connect('position-changed', win => {
        cloneActor.set_position(actor.x, actor.y);
    });

    const sizeHandler = win.connect('size-changed', win => {
        const rect = win.get_frame_rect();
        cloneActor.set_size(rect.width, rect.height);
    });

    cloneActor.connect('destroy', () => {
        win.disconnect(positionHandler);
        win.disconnect(sizeHandler);
    });

    Main.layoutManager.addChrome(cloneActor);

    NOTIFY_CLONE = cloneActor;
}

function destroyNotifyWindow(win) {
    if (!win || win.get_role() !== 'clubhouse-msg-notify')
        return;
    _destroyNotifyClone();
}

function showOverview() {
    const app = Utils.getClubhouseApp();

    _destroyNotifyClone();

    const notify = app.get_windows().find(w => w.get_role() === 'clubhouse-msg-notify');
    if (notify)
        mapNotifyWindow(notify, notify.get_compositor_private());
}

function onOnboardingHLChanged(isOnboardingHL) {
    const app = Utils.getClubhouseApp();
    const notify = app.get_windows().find(w => w.get_role() === 'clubhouse-msg-notify');

    if (!isOnboardingHL && !Main.overview.visible) {
        _destroyNotifyClone();
        return;
    }

    if (notify)
        mapNotifyWindow(notify, notify.get_compositor_private(), isOnboardingHL);
}

async function connectOnboarding(cancellable) {
    try {
        ONBOARDING_PROXY = await Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null,
            'org.endlessos.onboarding',
            '/org/endlessos/onboarding',
            'org.endlessos.onboarding',
            cancellable);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            log('error creating onboarding proxy: %s'.format(e.message));
        return;
    }

    ONBOARDING_HL_HANDLER = ONBOARDING_PROXY.connect('g-properties-changed',
        (_proxy, changedProps) => {
            const props = changedProps.deep_unpack();
            if ('IsHighlight' in props) {
                const isOnboardingHL = props['IsHighlight'].unpack();
                onOnboardingHLChanged(isOnboardingHL);
            }
        });
}

function enable() {
    CLUBHOUSE = new Component();

    if (CLUBHOUSE)
        CLUBHOUSE.enable();

    Utils.override(MessageList.URLHighlighter, 'setMarkup', setMarkup);
    Utils.override(MessageList.Message, 'setUseBodySimpleMarkup', setUseBodySimpleMarkup);
    Utils.override(MessageList.Message, 'setBody', setBody);

    Utils.override(NotificationDaemon.GtkNotificationDaemonAppSource, 'activateActionFull', activateActionFull);
    Utils.override(NotificationDaemon.GtkNotificationDaemonAppSource, 'activateAction', activateAction);

    SHOW_OVERVIEW_HANDLER = Main.overview.connect('showing', showOverview);
    HIDE_OVERVIEW_HANDLER = Main.overview.connect('hidden', _destroyNotifyClone);

    MAP_WINDOW_HANDLER = global.window_manager.connect('map', (wm, actor) => {
        if (actor && actor.metaWindow)
            mapNotifyWindow(actor.metaWindow, actor);
    });

    DESTROY_WINDOW_HANDLER = global.window_manager.connect('destroy', (wm, actor) => {
        if (actor && actor.metaWindow)
            destroyNotifyWindow(actor.metaWindow);
    });

    // Check the onboarding extension to show the notification over the highlighting
    ONBOARDING_CANCELLABLE = new Gio.Cancellable();
    connectOnboarding(ONBOARDING_CANCELLABLE);
}

function disable() {
    Main.overview.disconnect(SHOW_OVERVIEW_HANDLER);
    Main.overview.disconnect(HIDE_OVERVIEW_HANDLER);
    global.window_manager.disconnect(MAP_WINDOW_HANDLER);
    global.window_manager.disconnect(DESTROY_WINDOW_HANDLER);
    if (ONBOARDING_HL_HANDLER)
        ONBOARDING_PROXY.disconnect(ONBOARDING_HL_HANDLER);
    if (ONBOARDING_CANCELLABLE) {
        ONBOARDING_CANCELLABLE.cancel();
        ONBOARDING_CANCELLABLE = null;
    }

    if (CLUBHOUSE) {
        CLUBHOUSE.disable();
        CLUBHOUSE = null;
    }

    _destroyNotifyClone();

    Utils.restore(MessageList.URLHighlighter);
    Utils.restore(MessageList.Message);
    Utils.restore(NotificationDaemon.GtkNotificationDaemonAppSource);
}
