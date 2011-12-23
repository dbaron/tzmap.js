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

        var isHTTP = window.location.protocol == "http:" ||
                     window.location.protocol == "https:";

        function rsc() {
            if (gXHR.readyState != 4) {
                return;
            }

            var success = false;
            if (!isHTTP || (200 <= gXHR.status && gXHR.status < 300)) {
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
        gXHR.open("GET", isHTTP ? "world-map.json.gz" : "world-map.json");
        gXHR.send();
    }

    /**
     * Check if needle is in [rangea, rangeb] or [rangeb, rangea].
     */
    function in_range(needle, rangea, rangeb) {
        if (rangea < rangeb) {
            return rangea <= needle && needle <= rangeb;
        } else {
            return rangeb <= needle && needle <= rangea;
        }
    }

    function zoneContains(tzid, lat, lon) {
        var zones = gJSON.zones;
        var chains = gJSON.chains;

        var zone = zones[tzid];
        for (var regionIdx in zone) {
            var region = zone[regionIdx];

            // Since we don't need to worry about zones containing the
            // north pole (FIXME: really?), we can just count the number
            // of times that a north-south line from the north pole to
            // our point intersects the zone.
            // Furthermore, the segments are short enough that we don't
            // need to worry about whether they're great circle lines or
            // lines on an easier projection.
            var intersects = 0;
            for (var chainIdx in region) {
                var chainobj = region[chainIdx];
                var chainID = chainobj[0];
                var chainInv = chainobj[1];
                var chain = chains[chainID];
                var prevlon, prevlat;
                for (var pointIdx in chain) {
                    var pointobj = chain[pointIdx];
                    var ptlon = pointobj[0];
                    var ptlat = pointobj[1];
                    if (pointIdx > 0) {
                        if (ptlon == prevlon) {
                            // vertical line.  All we need to do is
                            // check if our point is *on* it.
                            if (ptlon == lon
                                && in_range(lat, ptlat, prevlat))
                                return true;
                        } else {
                            var alon, ptalon, prevalon;
                            if (Math.abs(ptlon - prevlon) > 180) {
                                // this segment crosses the date line,
                                // so use adjusted numbers instead
                                alon = (lon + 180) % 360;
                                ptalon = (ptlon + 180) % 360;
                                prevalon = (prevlon + 180) % 360;
                            } else {
                                alon = lon;
                                ptalon = ptlon;
                                prevalon = prevlon;
                            }

                            if (ptalon < prevalon) {
                                var tmp = ptalon;
                                ptalon = prevalon;
                                prevalon = tmp;
                            }

                            // Check the endpoint at the west end but
                            // not the east end.  This does the right
                            // thing for the intersects count, since we
                            // need to worry about both what happens
                            // when the segments turn back the opposite
                            // east/west or continue the same east/west
                            // from the boundary.  FIXME: But it's not
                            // quite right for the on-the-line check.
                            if (prevalon <= alon && alon < ptalon) {
                                var xlat = prevlat + (ptlat - prevlat) * ((alon - prevalon) / (ptalon - prevalon));
                                if (xlat == lat)
                                    // on the line
                                    return true;
                                if (xlat > lat) {
                                    ++intersects;
                                }
                            }
                        }
                    }
                    prevlon = ptlon;
                    prevlat = ptlat;
                }
            }
            if (intersects % 2 == 1) {
                return true;
            }
        }
        return false;
    }

    var public_zoneContains = function(zone, lat, lon) {
        if (lat >= 90 || lat <= -90)
            return null;
        lon = ((lon % 360) + 180) % 360 - 180;

        return zoneContains(zone, lat, lon);
    }

    var public_zoneAt = function(lat, lon) {
        if (lat >= 90 || lat <= -90)
            return null;
        lon = ((lon % 360) + 180) % 360 - 180;

        for (var tzid in gJSON.zones) {
            if (zoneContains(tzid, lat, lon)) {
                return tzid;
            }
        }
        return null;
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

        /**
         * zoneContains(zone, lat, lon)
         *
         * Return whether the time zone name (e.g.,
         * "America/Los_Angeles") contains the point at the given
         * latitude and longitude or has that point on its boundary.
         */
        zoneContains: public_zoneContains,

        /**
         * zoneAt(lat, lon)
         *
         * Return the time zone name (e.g., "America/Los_Angeles") at
         * the given latitude and longitude, or null if no time zone is
         * found at that location.  If the location is exactly on a time
         * zone boundary, which time zone will be returned is undefined,
         * but one of them will be.
         */
        zoneAt: public_zoneAt,
    };
})();
