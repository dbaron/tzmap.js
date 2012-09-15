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

all: output/world-map.json output/world-map.json.gz output/tzmap.js output/test-tzmap.html output/test-tile.html

output/world-map.json: shapefile-to-json.py ../tzmap/tz_world_mp.zip
	mkdir -p output
	./shapefile-to-json.py > $@

%.gz: %
	cat $< | gzip -9 > $@
	touch -r $< $@

output/tzmap.js: tzmap.js
	cp -p $< $@

output/test-tzmap.html: test-tzmap.html
	cp -p $< $@

output/test-tile.html: test-tile.html
	cp -p $< $@
