var cfg_edited = false;
var cfg_edited = false;

var dflt_opts = {
	colors: 16,
	paletteCount: 1,
	maxTiles: 256,
	method: 2,
	initColors: 4096,
	minHueCols: 0,
	dithKern: null,
	dithSerp: false,
	weighPopularity: true,
	weighEntropy: false,
};

var cfgs = {
	"baseball":     {jpg: true},
	"bebop":        {jpg: true},
	"fishie2":      {jpg: true},
	"bluff":        {jpg: true},
	"pheasant":     {jpg: true},
	"rainbow":      {jpg: true},
	"cloudplane":   {jpg: true},
	"redpanda":     {jpg: true},
	"photoman":     {jpg: true},
	"biking":       {jpg: true},
	"kitteh1":      {jpg: true},
	"compcube":     {jpg: true},
	"medusa":       {jpg: true},

	"fish":         {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 4096})},
	"kitteh2":      {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 512})},
	"quantfrog":    {           opts: $.extend({}, dflt_opts, {minHueCols: 512})},
	"treefrog":     {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 4096})},
	"baby":         {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 6144})},
	"chopsuey":     {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 1024})},

	"mult1":        {mult: ["legend","smb3","super2","rose"]},
	"mult2":        {mult: ["super1","kitteh1","penguins","baby"]},
	"mult3":        {mult: ["cloudplane","rose"]},
};

function fullImgSrc(thSrc) {
	var full = thSrc.replace("_th", ""),
		id = baseName(full)[0];

	return cfgs[id] && cfgs[id].jpg ? full.replace(".png", ".jpg") : full.replace(".jpg", ".png");
}

function baseName(src) {
	return src.split("/").pop().split(".");
}

function getOpts(id) {
	if ($("#custom_cfg")[0].checked || cfg_edited) {
		var opts = {};

		for (var i in dflt_opts) {
			var $el = $("#" + i),
				typ = $el.attr("type"),
				val = $el.val(),
				num = parseFloat(val);

			opts[i] = typ == "checkbox" ? $el.prop("checked") : isNaN(num) ? val : num;
		}

		return $.extend({}, dflt_opts, opts);
	}
	else if (cfgs[id] && cfgs[id].opts)
		var opts = $.extend({}, dflt_opts, cfgs[id].opts);
	else
		var opts = dflt_opts;

	for (var i in dflt_opts) {
		var el = $("#" + i).val(opts[i])[0];
		el && (el.size = el.value.length);
	}

	return opts;
}

function process(srcs) {
	var ti = new Timer();
	ti.start();

	$.getImgs(srcs, function() {
		var imgs = arguments;

		ti.mark("image(s) loaded");

		$orig.empty();
		$.each(imgs, function() {
			var id = baseName(this.src)[0];
			ti.mark("'" + id + "' -> DOM");

			$orig.append(this);
		});

		var opts = (srcs.length == 1) ? getOpts(baseName(srcs[0])[0]) : dflt_opts,
			quant = new RgbQuantSMS(opts);

		$.each(imgs, function() {
			var img = this, id = baseName(img.src)[0];

			ti.mark("sample '" + id + "'", function(){
				quant.sample(img);
			});
		});

		var palettes;
		ti.mark("build RGB palette", function() {
			palettes = quant.palettes();
		});
		
		console.warn(palettes);
		
		ti.mark("Display palette", function() {
			$palt.empty();
			palettes.forEach(function(palRgb){
				var pal8 = new Uint8Array(palRgb.length * 4);			
				var offs = 0;
				palRgb.forEach(function(entry){
					entry = entry || [0, 0, 0];
					// R, G, B
					pal8[offs++] = entry[0];
					pal8[offs++] = entry[1];
					pal8[offs++] = entry[2];
					// Alpha
					pal8[offs++] = 0xFF;
				});

				var pcan = drawPixels(pal8, 16, 128);

				var plabel = $('<div>').addClass('pal-numbers').html(palRgb.map(function(color){
					if (!color) {
						return '*';
					}
				
					var n = (color[0] & 0xC0) >> 6 | (color[1] & 0xC0) >> 4 | (color[2] & 0xC0) >> 2;
					return ('00' + n.toString(16)).substr(-2);
				}).join(' '));

				$palt.append(pcan).append(plabel);
			});			
		});

		$redu.empty();
		$tsetd.empty();
		$tsets.empty();
		$dupli.empty();
		$(imgs).each(function() {
			var img = this, id = baseName(img.src)[0];

			var unoptimizedTileMap;
			ti.mark("tileset + map '" + id + "'", function() {
				unoptimizedTileMap = quant.reduceToTileMap(img);
			});

			ti.mark("display unoptimized map '" + id + "'", function() {
				displayTilemap($redu, unoptimizedTileMap);
			});

			var optimizedTileMap;
			ti.mark("normalize tiles", function() {
				optimizedTileMap = quant.normalizeTiles(unoptimizedTileMap);
			});

			ti.mark("remove duplicate tiles", function() {
				optimizedTileMap = quant.removeDuplicateTiles(optimizedTileMap);
			});

			ti.mark("tileset -> DOM", function() {
				displayTileset($tsetd, optimizedTileMap.tiles, optimizedTileMap.palettes);
			});

			ti.mark("Calculate tile entropy", function() {
				quant.updateTileEntropy(optimizedTileMap.tiles);
			});
			
			var similarTiles;
			ti.mark("clusterize", function() {
				similarTiles = quant.groupBySimilarity(optimizedTileMap);
			});

			ti.mark("Remove similar tiles", function() {
				optimizedTileMap = quant.removeSimilarTiles(optimizedTileMap, similarTiles);
			});

			ti.mark("Display similar tiles", function() {
				displayTileset($tsets, optimizedTileMap.tiles, optimizedTileMap.palettes);
			});
			
			ti.mark("Display optimized image", function() {
				displayTilemap($dupli, optimizedTileMap);
			});
		});
	});
}

function displayTileset($container, tiles, palette) {
	$container.append($('<h5>').html(tiles.length + ' tiles'));

	tiles.forEach(function(tile){
		var image = new RgbQuantSMS.IndexedImage(8, 8, palette);
		image.drawTile(tile, 0, 0, tile.flipX, tile.flipY);
		var	ican = drawPixels(image.toRgbBytes(), image.width);
		$container.append(ican);
	});
}

function displayTilemap($container, tileMap) {
	var image = new RgbQuantSMS.IndexedImage(tileMap.mapW * 8, tileMap.mapH * 8, tileMap.palettes);
	image.drawMap(tileMap);
	var	ican = drawPixels(image.toRgbBytes(), image.width);
	$container.append(ican);
}


$(document).on("click", "img.th", function() {
	cfg_edited = false;
	var id = baseName(this.src)[0];

	var srcs;
	if (id.indexOf("mult") == 0) {
		srcs = cfgs[id].mult.map(function(id){
			return fullImgSrc($('img[src*="'+id+'"]')[0].src);
		});
	}
	else
		srcs = [this.src].map(fullImgSrc);

	process(srcs);
}).on("click", "#btn_upd", function(){
	var srcs = [$("#orig img")[0].src].map(fullImgSrc);
	process(srcs);
}).on("ready", function(){
	$orig = $("#orig"),
	$redu = $("#redu"),
	$tsetd = $("#tsetd"),
	$tsets = $("#tsets"),
	$dupli = $("#dupli"),
	
	$palt = $("#palt"),
	$stat = $("#stat"),
	$note = $("#note"),
	$opts = $("#opts");

	// Loads variables from local storage.
	for (var key in localStorage) {
		if (key.startsWith('custom-image-')) {
			var $newImg = $('<img>').addClass('th').attr('src', localStorage[key]);
			$('#custom-images').append($newImg);
		}
	}
}).on("change", "input, textarea, select", function() {
	cfg_edited = true;
}).on("change", "#add-image", function() {
	if (this.files && this.files[0]) {
		var reader = new FileReader();
		
		reader.onload = function (e) {
			var $newImg = $('<img>').addClass('th').attr('src', e.target.result);
			$('#custom-images').append($newImg);
			
			localStorage['custom-image-' + new Date().getTime()] = e.target.result;
		}
		
		reader.readAsDataURL(this.files[0]);
	}
}).on("click", "#clear-images", function(){
	for (var key in localStorage) {
		if (key.startsWith('custom-image-')) {
			localStorage.removeItem(key);
		}
		$('#custom-images > img').remove();
	}
});
