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

# A map from zone id to a list of regions, where each region is a list
# of points, and each point is a list of [lon, lat].
zoneRegions = {}

for shapeRec in sf.shapeRecords():
    tzid = shapeRec.record[0]
    shape = shapeRec.shape
    assert shape.shapeType == 5
    # shape.points contains a list of 2-item (x,y) lists
    # shape.parts contains a set of indices into points, giving the
    #   start of each part.
    # Start by turning these into a minimally-nicer data structure: a
    # list of regions, each of which is a list of points (see
    # zoneRegions).
    nregions = len(shape.parts)
    def build_points(idx):
        min = shape.parts[idx]
        if idx + 1 == nregions:
            max = len(shape.points)
        else:
            max = shape.parts[idx + 1]
        return shape.points[min:max]
    zoneRegions[tzid] = [ { "points": build_points(idx) } for idx in range(0, nregions)]

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
    def __cmp__(self, other):
        result = cmp(self.lon, other.lon)
        if result != 0:
            return result
        return cmp(self.lat, other.lat)
    def __hash__(self):
        return hash(self.lat) ^ hash(self.lon)

class SegmentRef:
    def __init__(self, tz, regionidx, segidx):
        self.tz = tz
        self.regionidx = regionidx
        self.segidx = segidx

class Segment:
    def __init__(self, a, b):
        assert a < b
        self.a = a
        self.b = b
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

for (tz, regions) in zoneRegions.iteritems():
    for regionidx in range(len(regions)):
        region = regions[regionidx]
        lls = [LonLat(pt[0], pt[1]) for pt in region["points"]]
        assert lls[0] == lls[len(lls)-1]
        for segidx in range(len(lls)-1):
            a = lls[segidx]
            b = lls[segidx+1]
            (seg, segdata, is_reversed) = find_segment(a, b)
            ref = SegmentRef(tz, regionidx, segidx)
            if is_reversed:
                assert segdata.revRef is None
                segdata.revRef = ref
            else:
                assert segdata.fwdRef is None
                segdata.fwdRef = ref
        # FIXME: store the segment data

# TODO: output

shutil.rmtree(tmpdir)
