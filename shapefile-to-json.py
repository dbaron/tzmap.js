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
# of points, and each point is a list of [lat, lon].
zoneRegions = {}

for shapeRec in sf.shapeRecords():
    tzid = shapeRec.record[0]
    shape = shapeRec.shape
    if shape.shapeType != 5:
        raise StandardError("unexpected shape type")
    # shape.points contains a list of 2-item (x,y) lists
    # shape.parts contains a set of indices into points, giving the
    #   start of each part.
    # Start by turning these into a minimally-nicer data structure: a
    # list of regions, each of which is a list of points (see
    # zoneRegions).
    nregions = len(shape.parts)
    def build_region(idx):
        min = shape.parts[idx]
        if idx + 1 == nregions:
            max = len(shape.points)
        else:
            max = shape.parts[idx + 1]
        return shape.points[min:max]
    regions = [build_region(idx) for idx in range(0,nregions)]
    zoneRegions[tzid] = regions

# TODO: build segments

# TODO: output

shutil.rmtree(tmpdir)
