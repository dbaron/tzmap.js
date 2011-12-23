/*
 * tzmap.js - Library for working with the geography of timezones in JavaScript

 * Written in 2011 by L. David Baron <dbaron@dbaron.org>

 * To the extent possible under law, the author(s) have dedicated all
 * copyright and related and neighboring rights to this software to the
 * public domain worldwide.  This software is distributed without any
 * warranty.
 *
 * You should have received a copy of the CC0 Public Domain Dedication
 * along with this software.  If not, see
 * <http://creativecommons.org/publicdomain/zero/1.0/>.
 */
(function() {
    "use strict";

    var gXHR = null;
    var gLoadSuccessCallbacks = [];
    var gLoadErrorCallbacks = [];
    var gJSON = null;

    var public_loadData = function(success_callback, error_callback) {
        if (gJSON) {
            if (success_callback) {
                setTimeout(success_callback, 0);
            }
            return;
        }
        if (success_callback) {
            gLoadSuccessCallbacks.push(success_callback);
        }
        if (error_callback) {
            gLoadErrorCallbacks.push(error_callback);
        }
        if (gXHR) {
            return;
        }

        function rsc() {
            if (gXHR.readyState != 4) {
                return;
            }

            var success = false;
            if (0 == gXHR.status || (200 <= gXHR.status && gXHR.status < 300)) {
                var json = null;
                try {
                    json = JSON.parse(gXHR.responseText);
                } catch (ex) {
                }
                if (json && json.chains && json.zones) {
                    success = true;
                    gJSON = json;
                }
            }

            var callbacks = success ? gLoadSuccessCallbacks
                                    : gLoadErrorCallbacks;

            gLoadSuccessCallbacks = [];
            gLoadErrorCallbacks = [];
            gXHR = null;

            for (var idx in callbacks) {
                callbacks[idx]();
            }
        }

        gXHR = new XMLHttpRequest();
        gXHR.onreadystatechange = rsc;
        gXHR.open("GET", "world-map.json.gz");
        gXHR.send();
    }

    // Exports:
    window.tzmap = {
        /**
         * loadData(success_callback, error_callback)
         *
         * This library has to load a significant amount of timezone
         * boundary data in order to work.  This function triggers the
         * loading of the data.  When the loading completes
         * successfully, success_callback is called; if it fails,
         * error_callback is called.
         *
         * Other methods of this library can be used only after
         * success_callback has been called.
         */
        loadData: public_loadData,
    };
})();
