#!/usr/bin/python

# tzmap.js - Library for working with the geography of timezones in JavaScript

# Written in 2011 by L. David Baron <dbaron@dbaron.org>

# To the extent possible under law, the author(s) have dedicated all
# copyright and related and neighboring rights to this software to the
# public domain worldwide.  This software is distributed without any
# warranty.
#
# You should have received a copy of the CC0 Public Domain Dedication
# along with this software.  If not, see
# <http://creativecommons.org/publicdomain/zero/1.0/>.

import os
import sys
import zipfile
import tempfile
import shutil
import json

BASEDIR = os.path.dirname(os.path.realpath(__file__))
SHAPEFILE_ZIP = os.path.join(os.path.dirname(BASEDIR),
                             "tzmap", 
                             "tz_world_mp.zip")

sys.path.append(os.path.join(BASEDIR, "pyshp"))
import shapefile

# The shapefile code requires files as input rather than file-like
# objects (easily fixable) and it also requires that they be seekable,
# which zip's file like objects are not.  So extract the files we need
# to a temporary location.
zf = zipfile.ZipFile(SHAPEFILE_ZIP, "r")
tmpdir = tempfile.mkdtemp(prefix="shp")
for f in [ "tz_world_mp.shp", "tz_world_mp.shx", "tz_world_mp.dbf" ]:
    zf.extract("world/" + f, tmpdir)
zf.close()

sf = shapefile.Reader(os.path.join(tmpdir, "world", "tz_world_mp"))

# A map from zone id to a list of polygons, where each polygon is a list
# of points, and each point is a list of [lon, lat].
zonePolygons = {}

for shapeRec in sf.shapeRecords():
    tzid = shapeRec.record[0]
    shape = shapeRec.shape
    assert shape.shapeType == 5
    # shape.points contains a list of 2-item (x,y) lists
    # shape.parts contains a set of indices into points, giving the
    #   start of each part.
    # Start by turning these into a minimally-nicer data structure: a
    # list of polygons, each of which is a list of points (see
    # zonePolygons).
    npolygons = len(shape.parts)
    def build_points(idx):
        min = shape.parts[idx]
        if idx + 1 == npolygons:
            max = len(shape.points)
        else:
            max = shape.parts[idx + 1]
        return shape.points[min:max]
    zonePolygons[tzid] = [ { "points": build_points(idx) } for idx in range(npolygons)]

# Uncomment to test with just four timezones:
#zonePolygons = { tz:zonePolygons[tz] for tz in zonePolygons if tz[0:9] == "America/L" }

sf = None
shutil.rmtree(tmpdir)

# We want to uniquely identify segments, but let them run either
# direction.  So given a segment that runs between [lona, lata] and
# [lonb, latb], we need to know which points are the canonical "first"
# points.  We define that by saying the "first" pair in the segment is
# the one where the longitude is smaller; if the longitudes are equal
# then it is the one where the latitude is smaller.

class LonLat:
    def __init__(self, lon, lat):
        self.lon = lon
        self.lat = lat
    # FIXME: __cmp__ no longer exists in python 3
    def __cmp__(self, other):
        result = cmp(self.lon, other.lon)
        if result != 0:
            return result
        return cmp(self.lat, other.lat)
    def __hash__(self):
        return hash(self.lat) ^ hash(self.lon)

class SegmentRef:
    def __init__(self, tz, polygonidx, segidx):
        self.tz = tz
        self.polygonidx = polygonidx
        self.segidx = segidx

class Segment:
    def __init__(self, a, b):
        assert a < b
        self.a = a
        self.b = b
    # FIXME: __cmp__ no longer exists in python 3
    def __cmp__(self, other):
        result = cmp(self.a, other.a)
        if result != 0:
            return result
        return cmp(self.b, other.b)
    def __hash__(self):
        return hash(self.a) ^ hash(self.b)

class SegmentData:
    def __init__(self):
        self.fwdRef = None
        self.revRef = None
        self.chain = None

segments = {}

# FIXME: This is slow!
def find_segment(a, b):
    assert a != b
    is_reversed = b < a
    if is_reversed:
        seg = Segment(b, a)
    else:
        seg = Segment(a, b)
    data = segments.setdefault(seg, SegmentData())
    return (seg, data, is_reversed)

# Build up the segment data, which tells us for each line segment that
# is part of a zone boundary, which zone or pair of zones uses that
# segment as part of its boundary.
for (tz, polygons) in zonePolygons.items():
    sys.stderr.write("Building segments for {0}.\n".format(tz))
    for polygonidx in range(len(polygons)):
        polygon = polygons[polygonidx]
        lls = [LonLat(pt[0], pt[1]) for pt in polygon["points"]]
        assert lls[0] == lls[len(lls)-1]
        def seg_for(segidx):
            a = lls[segidx]
            b = lls[segidx+1]
            (seg, segdata, is_reversed) = find_segment(a, b)
            ref = SegmentRef(tz, polygonidx, segidx)
            if is_reversed:
                assert segdata.revRef is None
                segdata.revRef = ref
            else:
                assert segdata.fwdRef is None
                segdata.fwdRef = ref
            return (seg, segdata, is_reversed)
        polygon["segs"] = [seg_for(segidx) for segidx in range(len(lls)-1)]

# Build up as-maximal-as-is-easy (i.e., we still break at the start/end
# of the original points list for the polygon) chains of line segments
# that separate the same pair of time zones.  (I'd have called them
# sequences, but then I'd have to distinguish "seg" and "seq".)
chains = []
def refs_in_sequence(refa, refb):
    if refa is None or refb is None:
        return refa is None and refb is None
    return refa.tz == refb.tz and \
           refa.polygonidx == refb.polygonidx and \
           abs(refa.segidx - refb.segidx) == 1
def segments_in_sequence(segdataa, segdatab):
    if refs_in_sequence(segdataa.fwdRef, segdatab.fwdRef) and \
       refs_in_sequence(segdataa.revRef, segdatab.revRef):
         return True
    if refs_in_sequence(segdataa.fwdRef, segdatab.revRef) and \
       refs_in_sequence(segdataa.revRef, segdatab.fwdRef):
         return True
    return False
for (tz, polygons) in zonePolygons.items():
    sys.stderr.write("Writing segments for {0}.\n".format(tz))
    for polygonidx in range(len(polygons)):
        polygon = polygons[polygonidx]
        segs = polygon["segs"]
        polygon["chains"] = polygonChains = []
        currentChainID = None
        currentChainData = None
        for segidx in range(len(segs)):
            (seg, segdata, is_reversed) = segs[segidx]
            if segdata.chain is None:
                # We're responsible for writing this segment
                continueChain = False
                if segidx != 0:
                    (prevseg, prevsegdata, prev_is_reversed) = segs[segidx-1]
                    if segments_in_sequence(prevsegdata, segdata) and \
                       (segdata.chain is None) == (currentChainData is not None):
                        continueChain = True
                if continueChain:
                    if is_reversed:
                        currentChainData.append(seg.a)
                    else:
                        currentChainData.append(seg.b)
                else:
                    currentChainID = len(chains)
                    if is_reversed:
                        currentChainData = [ seg.b, seg.a ]
                    else:
                        currentChainData = [ seg.a, seg.b ]
                    chains.append(currentChainData)
                    polygonChains.append([currentChainID, False])
                segdata.chain = currentChainID
            else:
                if currentChainID != segdata.chain:
                    currentChainID = segdata.chain
                    polygonChains.append([currentChainID, True])
                    currentChainData = None

json_data = {
              "chains": [[[point.lon, point.lat] for point in chain] for chain in chains],
              "zones": { tz: [polygon["chains"] for polygon in polygons]
                         for (tz, polygons) in zonePolygons.items() }
            }

print(json.dumps(json_data, sort_keys=True))
