(function(define) {
'use strict';
// VideoProgressSlider module.
define(
'video/06_video_progress_slider.js', [],
function() {
    /**
     * Video progress slider module.
     * @exports video/06_video_progress_slider.js
     * @constructor
     * @param {Object} state The object containing the state of the video
     * @param {Object} i18n The object containing strings with translations.
     * @return {jquery Promise}
     */
    var ProgressSlider = function(state, i18n) {
        if (!(this instanceof ProgressSlider)) {
            return new ProgressSlider(state, i18n);
        }

        this.state = state;
        this.state.videoProgressSlider = this;
        this.i18n = i18n;
        this.initialize();

        return $.Deferred().resolve().promise();
    };

    ProgressSlider.prototype = {
        /** Step to increase/decrease volume level via keyboard. */
        step: 20,

        /** Initializes the module. */
        initialize: function() {
            this.el = this.state.el.find('.video-controls .slider');
            this.slider = this.render();
            this.sliderProgress = this.slider.find(
                '.ui-slider-range.ui-widget-header.ui-slider-range-min'
            );
            this.a11y = new Accessibility(this.el, this.slider, this.i18n);
            this.bindHandlers();
        },

        /**
         * Creates any necessary DOM elements, attach them, and set their,
         * initial configuration.
         */
        render: function() {
            return this.el.slider({
                range: 'min',
                slide: this.onSlide.bind(this),
                stop: this.onStop.bind(this)
            });
        },

        /** Bind any necessary function callbacks to DOM events. */
        bindHandlers: function() {
            this.state.el.on({
                'controls:update_region': function (event, params) {
                    this.updateStartEndTimeRegion(params);
                }.bind(this),
                'endTime': function () {
                    this.a11y.notifyThroughHandleEnd(true);
                }.bind(this),
                'ended': function () {
                    this.a11y.notifyThroughHandleEnd(true);
                }.bind(this),
                'play': function () {
                    this.a11y.notifyThroughHandleEnd(false);
                }.bind(this),
                'controls:update_time': this.onUpdateTimeHandler.bind(this),
                'progress.progres_control': this.onUpdateTimeHandler.bind(this),
                'seek': this.onUpdateTimeHandler.bind(this)
            });
        },

        /**
         * Rebuild the slider start-end range (if it doesn't take up the
         * whole slider). Remember that endTime === null means the end-time
         * is set to the end of video by default.
         * @param {Object} params The object containing start. end times and
         * duration for the video.
         */

        updateStartEndTimeRegion: function (params) {
            var duration = params.duration,
                startTime = params.startTime,
                endTime = params.endTime,
                isCorrectStartTime = _.isNumber(startTime),
                isCorrectEndTime = _.isNumber(endTime) || _.isNull(endTime),
                rangeParams;

            // We must have a duration in order to determine the area of range.
            // It also must be non-zero.
            if (!(duration && isCorrectStartTime && isCorrectEndTime)) {
                return false;
            }

            if (startTime === 0 && endTime === null) {
                return false;
            }

            // Because JavaScript has weird rounding rules when a series of
            // mathematical operations are performed in a single statement, we
            // will split everything up into smaller statements.
            //
            // This will ensure that visually, the start-end range aligns nicely
            // with actual starting and ending point of the video.

            rangeParams = this.getRangeParams(startTime, endTime, duration);

            if (!this.sliderRange) {
                this.sliderRange = $('<div />', {
                    'class': 'ui-slider-range ' +
                             'ui-widget-header ' +
                             'ui-corner-all ' +
                             'slider-range'
                }).css(rangeParams);

                this.sliderProgress.after(this.sliderRange);
            } else {
                this.sliderRange.css(rangeParams);
            }
        },

        getRangeParams: function (startTime, endTime, duration) {
            var step = 100 / duration,
                left = startTime * step,
                width = endTime * step - left;

            return {
                left: left + '%',
                width: width + '%'
            };
        },

        onSlide: function (event, ui) {
            event.stopPropagation();

            var time = ui.value,
                duration = this.state.videoPlayer.duration();

            this.state.el.off('progress.progres_control');
            this.updatePlayTime(time, duration);
            this.a11y.update(this.state.videoPlayer.currentTime);
            this.state.el.trigger('seek', [time, duration]);
        },

        onStop: function (event, ui) {
            event.stopPropagation();
            this.state.el.on(
                'progress.progres_control',
                this.onUpdateTimeHandler.bind(this)
            );
            this.state.log('seek_video', {
                old_time: this.state.videoPlayer.currentTime,
                new_time: ui.value,
                type: 'onSlideSeek'
            });
        },

        updatePlayTime: function (time, duration) {
            this.slider.slider('option', {
                'max': Math.floor(duration),
                'value': Math.floor(time)
            });
        },

        onUpdateTimeHandler: function (event, time, duration) {
            this.updatePlayTime(time, duration);
        }
    };

    /**
     * Module responsible for the accessibility of volume controls.
     * @constructor
     * @private
     * @param {jquery $} el Wrapper of the progress slider.
     * @param {jquery $} slider The progress slider.
     * @param {Object} i18n The object containing strings with translations.
     */
    var Accessibility = function (el, slider, i18n) {
        this.el = el;
        this.slider = slider;
        this.handle = slider.find('.ui-slider-handle');
        this.i18n = i18n;

        this.initialize();
    };

    Accessibility.prototype = {
        /** Initializes the module. */
        initialize: function() {
            // We just want the knob to be selectable with keyboard
            this.el.attr('tabindex', -1);
            this.handle.attr({
                'role': 'slider',
                'title': this.i18n['Video position'],
                'aria-disabled': false,
                'aria-valuetext': this.getTimeDescription(
                    this.slider.slider('option', 'value')
                )
            });
        },

        update: function (value) {
            this.handle.attr('aria-valuetext', this.getTimeDescription(value));
        },

        /**
         * When the video stops playing (either because the end was reached, or
         * because endTime was reached), the screen reader must be notified that
         * the video is no longer playing. We do this by a little trick. Setting
         * the title attribute of the slider know to "video ended", and focusing
         * on it. The screen reader will read the attr text.
         * The user can then tab his way forward, landing on the next control
         * element, the Play button.
         * @param {Boolean} isEnded  -  If set to true, the function must set
         * the title attribute to `video ended`;
         * if set to false, the function must reset the attr to it's original
         * state.
         */
        notifyThroughHandleEnd: function (isEnded) {
            var text = isEnded ? 'Video ended' : 'Video position';

            this.handle.attr('title', this.i18n[text]);
            if (isEnded) {
                this.handle.focus();
            }
        },

        getTextForTime: function (value, word) {
            if (!value || !_.isFunction(this.i18n['getTextFor' + word])) {
                return false;
            }

            return this.i18n['getTextFor' + word](value);
        },

        /**
         * Returns a string describing the current time of video in
         * `%d hours %d minutes %d seconds` format.
         * @param {Number} Time needs to be converted.
         * @return {String}
         */
        getTimeDescription: function (time) {
            if (!_.isNumber(time)) {
                time = 0;
            }

            var seconds = Math.floor(time),
                minutes = Math.floor(seconds / 60),
                hours = Math.floor(minutes / 60);

            return _.compact([
                this.getTextForTime(hours, 'Hours'),
                this.getTextForTime(minutes % 60, 'Minutes'),
                this.getTextForTime(seconds % 60, 'Seconds')
            ]).join(' ');
        }
    };

    return ProgressSlider;
});
}(RequireJS.define));

