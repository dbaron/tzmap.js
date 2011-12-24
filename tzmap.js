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

    var public_loadData = function(path, success_callback, error_callback) {
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

        var protocol_match = path.match(/^([^/?#]+):/)
        var isHTTP;
        if (protocol_match) {
            isHTTP = protocol_match[1] == "http" ||
                     protocol_match[1] == "https";
        } else {
            isHTTP = window.location.protocol == "http:" ||
                     window.location.protocol == "https:";
        }
        path += "world-map.json";
        if (isHTTP) {
            path += ".gz";
        }

        function do_notify(success) {
            var callbacks = success ? gLoadSuccessCallbacks
                                    : gLoadErrorCallbacks;

            gLoadSuccessCallbacks = [];
            gLoadErrorCallbacks = [];
            gXHR = null;

            for (var idx in callbacks) {
                callbacks[idx]();
            }
        }

        function rsc() {
            if (gXHR.readyState != 4) {
                return;
            }

            var success = false;
            if (!isHTTP || (200 <= gXHR.status && gXHR.status < 300)) {
                var json = null;
                try {
                    if ("responseType" in gXHR && gXHR.responseType == "json") {
                        json = gXHR.response;
                    } else {
                        json = JSON.parse(gXHR.responseText);
                    }
                } catch (ex) {
                }
                if (json && json.chains && json.zones) {
                    success = true;
                    gJSON = json;
                }
            }

            do_notify(success);
        }

        try {
            gXHR = new XMLHttpRequest();
            gXHR.onreadystatechange = rsc;
            gXHR.open("GET", path);
            if ("responseType" in gXHR) {
                try {
                    gXHR.responseType = "json";
                } catch(ex) {
                    // Chrome 16 (nightly) supports "text" but not "json"
                    gXHR.responseType = "text";
                }
            }
            gXHR.send();
        } catch(ex) {
            do_notify(false);
        }
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
        for (var polygonIdx in zone) {
            var polygon = zone[polygonIdx];

            // Since we don't need to worry about zones containing the
            // north pole (FIXME: really?), we can just count the number
            // of times that a north-south line from the north pole to
            // our point intersects the zone.
            // Furthermore, the segments are short enough that we don't
            // need to worry about whether they're great circle lines or
            // lines on an easier projection.
            var intersects = 0;
            for (var chainIdx in polygon) {
                var chainobj = polygon[chainIdx];
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

    function firstpt(chainID) {
        return gJSON.chains[chainID][0];
    }

    function lastpt(chainID) {
        var chain = gJSON.chains[chainID];
        return chain[chain.length - 1];
    }

    function pts_equal(a, b) {
        return a[0] == b[0] && a[1] == b[1];
    }

    var public_polygonsFor = function(zone_array) {
        // A set of chain IDs, except there is a useful value on the
        // value side of the hash:  whether the chain is used forwards
        // (false) or in reverse (true).
        var chains = {};

        for (var zoneIdx in zone_array) {
            var tzid = zone_array[zoneIdx];
            var zone = gJSON.zones[tzid];
            for (var polygonIdx in zone) {
                var polygon = zone[polygonIdx];
                for (var chainIdx in polygon) {
                    var chainobj = polygon[chainIdx];
                    var chainID = chainobj[0];
                    var reverse = chainobj[1];
                    if (chainID in chains) {
                        // It's a shared boundary
                        delete chains[chainID];
                    } else {
                        chains[chainID] = reverse;
                    }
                }
            }
        }

        var result = [];

        // Append the polygons that are in one chain, and put the rest
        // of the chains in a hash by their starting longitude.
        var startlons = {};
        for (var chainID in chains) {
            if (pts_equal(firstpt(chainID), lastpt(chainID))) {
                // This chain is a complete polygon.
                var reverse = chains[chainID];
                var chain = gJSON.chains[chainID];
                if (chains[chainID]) {
                    // append in reverse
                    result.push([].concat(chain).reverse());
                } else {
                    // append in forward order (without copy)
                    result.push(chain);
                }
            } else {
                var reverse = chains[chainID];
                var info = { chainID: chainID, reverse: reverse };
                var startlon = (reverse ? lastpt : firstpt)(chainID)[0];
                if (startlon in startlons) {
                    startlons[startlon].push(info);
                } else {
                    startlons[startlon] = [ info ];
                }
            }
        }
        chains = null;

        // Deal with the polygons that we hashed by starting longitude.
        function first_startlon() {
            for (var startlon in startlons) {
                return startlon;
            }
            return null;
        }
        for (;;) {
            var startlon = first_startlon();
            if (startlon === null) {
                break;
            }
            var polygon = [];
            do {
                var arr, info;
                if (polygon.length == 0) {
                    arr = startlons[startlon];
                    info = arr.pop();
                } else {
                    var startpt = polygon[polygon.length - 1];
                    startlon = startpt[0];
                    arr = startlons[startlon];
                    info = null;
                    for (var idx in arr) {
                        var testinfo = arr[idx];
                        var testpt = (testinfo.reverse ? lastpt : firstpt)(testinfo.chainID);
                        if (testpt[1] == startpt[1]) {
                            arr.splice(idx, 1);
                            info = testinfo;
                            break;
                        }
                    }
                }
                if (arr.length == 0) {
                    delete startlons[startlon];
                }
                var chain = gJSON.chains[info.chainID];
                if (info.reverse) {
                    polygon = polygon.concat([].concat(chain).reverse());
                } else {
                    polygon = polygon.concat(chain);
                }
                // Note: minimum of 2 iterations
            } while (!pts_equal(polygon[0], polygon[polygon.length - 1]));
            result.push(polygon);
        }

        return result;
    }

    // Exports:
    window.tzmap = {
        /**
         * loadData(path, success_callback, error_callback)
         *
         * This library has to load a significant amount of timezone
         * boundary data in order to work.  This function triggers the
         * loading of the data.  The path argument given is the path to
         * the directory in which the data are located (usually the same
         * as the script), which must end with a slash, and may be a
         * path relative to the document.  When the loading completes
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
         * Supports the "uninhabited" zone, but not null.
         */
        zoneContains: public_zoneContains,

        /**
         * zoneAt(lat, lon)
         *
         * Return the time zone name (e.g., "America/Los_Angeles") at
         * the given latitude and longitude, "uninhabited" for land
         * areas for which no time zone is known for the location (e.g.,
         * Antarctica), or null for water areas.  If the location is
         * exactly on a time zone boundary, which time zone will be
         * returned is undefined, but one of them will be.
         */
        zoneAt: public_zoneAt,

        /**
         * polygonsFor(zone_array)
         *
         * Get the set of polygons for a set of timezones.  Each name in
         * zone_array should be an tz database timezone name.  This API
         * will return an array of non-adjacent polygons, where each
         * polygon is an array of points (the first and last being the
         * same), and each point is an array of [lon, lat] as floats.
         */
        polygonsFor: public_polygonsFor,
    };
})();
