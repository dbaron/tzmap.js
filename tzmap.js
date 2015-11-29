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
    var gDataXHR = null;
    var gLoadSuccessCallbacks = [];
    var gLoadErrorCallbacks = [];
    var gJSON = null;
    var gData = null;

    var public_loadData = function(path, success_callback, error_callback) {
        if (gJSON && jData) {
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
        var json_path = path + "world-map.json";
        var data_path = path + "world-map.data";
        if (isHTTP) {
            json_path += ".gz";
            data_path += ".gz";
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

        function json_rsc() {
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
                if (json && json.zones) {
                    success = true;
                    gJSON = json;
                }
            }

            if (!success || gData) {
                do_notify(success);
            }
        }

        function data_rsc() {
            if (gDataXHR.readyState != 4) {
                return;
            }

            var success = false;
            if (!isHTTP || (200 <= gDataXHR.status && gDataXHR.status < 300)) {
                if (gDataXHR.responseType == "arraybuffer") {
                    var arraybuffer = gDataXHR.response;
                    gData = new DataView(arraybuffer);
                    success = true;
                }
            }

            if (!success || gJSON) {
                do_notify(success);
            }
        }

        try {
            gXHR = new XMLHttpRequest();
            gXHR.onreadystatechange = json_rsc;
            gXHR.open("GET", json_path);
            if ("responseType" in gXHR) {
                try {
                    gXHR.responseType = "json";
                } catch(ex) {
                    // Chrome 16 (nightly) supports "text" but not "json"
                    gXHR.responseType = "text";
                }
            }
            gXHR.send();

            gDataXHR = new XMLHttpRequest();
            gDataXHR.onreadystatechange = data_rsc;
            gDataXHR.open("GET", data_path);
            gDataXHR.responseType = "arraybuffer";
            gDataXHR.send();
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
        // FIXME: Need to fix for new format!
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

    function pointat(index) {
        var lon = gData.getFloat64(index * 16, true);
        var lat = gData.getFloat64(index * 16 + 8, true);
        return [lon, lat];
    }

    function pts_equal(a, b) {
        return a[0] == b[0] && a[1] == b[1];
    }

    var public_polygonsFor = function(zone_array) {
        // A hash of chain start: end indices.  If the start is higher
        // than the end, then the points are used in reverse.
        var chains = [];

        for (var zoneIdx in zone_array) {
            var tzid = zone_array[zoneIdx];
            var zone = gJSON.zones[tzid];
            for (var polygonIdx in zone) {
                var polygon = zone[polygonIdx];
                for (var chainIdx in polygon) {
                    var chainobj = polygon[chainIdx];
                    var start = chainobj[0];
                    var end = chainobj[1];
                    // Convert one-past-end index to last-item
                    // index given start:end hashing.
                    if (end > start) {
                        --end;
                    } else {
                        --start;
                    }
                    if (end in chains) {
                        if (chains[end] != start) {
                            console.log("unexpected chain data", start, end, chains[end]);
                            return null;
                        }
                        // It's a shared boundary
                        delete chains[end];
                    } else {
                        chains[start] = end;
                    }
                }
            }
        }

        var result = [];

        // Append the polygons that are in one chain, and put the rest
        // of the chains in a hash by their starting longitude.
        var startlons = {};
        for (var chainStart in chains) {
            var chainEnd = chains[chainStart];
            var reverse;
            if (chainStart > chainEnd) {
                var tmp = chainStart;
                chainStart = chainEnd;
                chainEnd = tmp;
                reverse = true;
            } else {
                reverse = false;
            }
            var chain = [];
            for (var i = chainStart; i <= chainEnd; ++i) {
                chain.push(pointat(i));
            }
            if (reverse) {
                chain.reverse();
            }
            if (pts_equal(chain[0], chain[chain.length - 1])) {
                // This chain is a complete polygon.
                result.push(chain);
            } else {
                var startlon = chain[0][0];
                if (startlon in startlons) {
                    startlons[startlon].push(chain);
                } else {
                    startlons[startlon] = [ chain ];
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
                var arr, chain;
                if (polygon.length == 0) {
                    arr = startlons[startlon];
                    chain = arr.pop();
                } else {
                    var startpt = polygon[polygon.length - 1];
                    startlon = startpt[0];
                    arr = startlons[startlon];
                    chain = null;
                    for (var idx in arr) {
                        var testchain = arr[idx];
                        var testpt = testchain[0];
                        if (testpt[1] == startpt[1]) {
                            arr.splice(idx, 1);
                            chain = testchain;
                            break;
                        }
                    }
                }
                if (arr.length == 0) {
                    delete startlons[startlon];
                }
                polygon = polygon.concat(chain);
                // Note: minimum of 2 iterations
            } while (!pts_equal(polygon[0], polygon[polygon.length - 1]));
            result.push(polygon);
        }

        return result;
    }

    var public_tileFor = function(lats, lons, polygonsArray) {
        var height = lats.length;
        var width = lons.length;
        var colorCanvas = document.createElement("canvas");
        colorCanvas.height = 1;
        colorCanvas.width = 1;
        var colorcx = colorCanvas.getContext("2d");
        var canvas = document.createElement("canvas");
        canvas.height = height;
        canvas.width = width;
        var cx = canvas.getContext("2d");
        var id = cx.createImageData(width, height);
        for (var polygonsIdx in polygonsArray) {
            var polygonsObj = polygonsArray[polygonsIdx];
            colorcx.fillStyle = polygonsObj.color;
            colorcx.clearRect(0, 0, 1, 1);
            colorcx.fillRect(0, 0, 1, 1);
            var colorArray = colorcx.getImageData(0, 0, 1, 1).data;
            for (var column = 0, column_end = width;
                 column < column_end; ++column) {
                var lon = lons[column];
                // pixels is a list of the pixels in the tile whose
                // presence in the polygon  is *different* from the
                // pixel above.  (The 0th entry represents simply
                // whether the top pixel is in the polygon.)
                // FIXME: could be typed array
                var pixels = new Array(height);
                for (var y = 0; y < height; ++y) {
                    pixels[y] = false;
                }

                for (var polygonIdx in polygonsObj.polygons) {
                    var pointList = polygonsObj.polygons[polygonIdx];
                    for (var pt1Idx = 0; pt1Idx < pointList.length; ++pt1Idx) {
                        var pt2Idx = pt1Idx + 1;
                        if (pt2Idx == pointList.length) {
                            pt2Idx = 0;
                        }

                        var lon1 = pointList[pt1Idx][0];
                        var lon2 = pointList[pt2Idx][0];
                        var flip = Math.abs(lon2 - lon1) > 180;
                        if (((lon1 < lon) == (lon2 < lon)) != flip) {
                            // This segment does not affect this column.
                            // NOTE: This means that we return here for any
                            // purely vertical segment (lon1 == lon2).
                            // NOTE: The fact that both tests above are <
                            // means that we correctly handle the case of
                            // horizontal segments that start or end
                            // exactly at this column.  This is
                            // particularly important when two such
                            // segments are joined by a vertical that runs
                            // exactly along this column.  In particular,
                            // a line along this column gets colored if
                            // the inside of the polygon is to the right,
                            // since values equal to lon are treated the
                            // same as those greater.
                            continue;
                        }

                        var lat1 = pointList[pt1Idx][1];
                        var lat2 = pointList[pt2Idx][1];

                        var portion;
                        if (flip) {
                            var llon = (lon + 540) % 360;
                            lon1 = (lon1 + 540) % 360;
                            lon2 = (lon2 + 540) % 360;
                            portion = (llon - lon1) / (lon2 - lon1);
                        } else {
                            portion = (lon - lon1) / (lon2 - lon1);
                        }

                        var intercept = (1 - portion) * lat1 + portion * lat2;

                        if (!(lats[height-1] < intercept)) { // see below for <
                            continue;
                        }
                        if (lats[0] < intercept) { // see below for <
                            pixels[0] = !pixels[0];
                            continue;
                        }

                        // Binary search

                        // Both inclusive.  Already checked y==0 above.
                        // Note that lats are *reverse-sorted*, so min
                        // is for largest-latitude and max is lowest.
                        var min = 1, max = height - 1;

                        while (min != max) {
                            // Make a line exactly hitting the intercept
                            // color the pixel if the inside of the polygon
                            // is below by treating equal-to-intercept and
                            // greater-than-intercept the same (remember
                            // positive is up).
                            var y = min + Math.floor((max - min) / 2);
                            if (lats[y] < intercept) {
                                max = y;
                            } else {
                                min = y + 1;
                            }
                        }
                        pixels[min] = !pixels[min];
                    }
                }

                // Now actually fill in the pixels.
                var drawing = false;
                for (var y = 0; y < height; ++y) {
                    if (pixels[y]) {
                        drawing = !drawing;
                    }
                    if (drawing) {
                        id.data.set(colorArray, (y * width + column) * 4);
                    }
                }
            }
        }
        cx.putImageData(id, 0, 0);
        return canvas;
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

        /**
         * tileFor(lats, lons, polygons)
         *
         * Return an HTML canvas element (created off the window's
         * document) that contains the given set of polygons drawn to
         * it.
         *
         * FIXME: want to do whole vertical row of tiles at once!
         *
         * FIXME: The performance of this function is not (yet)
         * acceptable.
         *
         * Note that this API means that the tiles must be based on a
         * map projection (like Mercator or Peters) where all vertical
         * lines correspond to lines of longitude and all horizontal
         * lines correspond to lines of latitude.  (This allows for
         * significant optimization that makes the tile generation
         * possible in a reasonable amount of time.)
         *
         * lats - array, must be sorted top to bottom
         * lons - array, must be sorted right to left (wrap allowed)
         * polygons - an array of objects, where each object in the
         *   array is an object with two properties:
         *     color: a CSS Color (usable for the HTML canvas API)
         *     polygons: a set of polygons such as that returned from
         *       polygonsFor
         */
        tileFor: public_tileFor,
    };
})();
