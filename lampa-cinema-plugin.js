(function () {
    'use strict';

    /*
     * Lampa Cinema: catalogue UI for TMDB and user-owned playback providers.
     * The plugin intentionally does not scrape websites or bypass paywalls/ads.
     */
    var PLUGIN = 'lampa_cinema';
    var STORAGE = PLUGIN + '_config';
    var DEFAULTS = {
        tmdb_key: '',
        tmdb_language: 'ru-RU',
        provider_url: '',
        provider_token: ''
    };

    function config() {
        try {
            return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORAGE) || '{}'));
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }

    function save(data) {
        localStorage.setItem(STORAGE, JSON.stringify(data));
    }

    function request(url, options) {
        options = options || {};
        return fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        });
    }

    function tmdb(path, params) {
        var current = config();
        if (!current.tmdb_key) {
            return Promise.reject(new Error('Не указан TMDB API key'));
        }
        params = Object.assign({}, params || {}, {
            api_key: current.tmdb_key,
            language: current.tmdb_language
        });
        return request('https://api.themoviedb.org/3' + path + '?' + new URLSearchParams(params));
    }

    function image(path, size) {
        return path ? 'https://image.tmdb.org/t/p/' + (size || 'w500') + path : '';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[char];
        });
    }

    function mediaTitle(item) {
        return item.title || item.name || item.original_title || item.original_name || 'Без названия';
    }

    function normalise(item) {
        return {
            id: item.id,
            title: mediaTitle(item),
            poster: image(item.poster_path, 'w342'),
            backdrop: image(item.backdrop_path, 'w1280'),
            overview: item.overview || 'Описание отсутствует',
            rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '-',
            year: String(item.release_date || item.first_air_date || '').slice(0, 4),
            type: item.media_type === 'tv' || item.name ? 'tv' : 'movie'
        };
    }

    function provider(item) {
        var current = config();
        if (!current.provider_url) return Promise.resolve([]);
        var url = current.provider_url.replace(/\/$/, '') + '/resolve?' + new URLSearchParams({
            tmdb_id: item.id,
            type: item.type
        });
        var headers = current.provider_token ? {Authorization: 'Bearer ' + current.provider_token} : {};
        return request(url, {headers: headers}).then(function (data) {
            return Array.isArray(data) ? data : (data.sources || []);
        });
    }

    function settings() {
        var current = config();
        var key = prompt('TMDB API key (обязателен для каталога):', current.tmdb_key);
        if (key === null) return;
        var providerUrl = prompt('URL вашего playback API (необязательно):', current.provider_url);
        if (providerUrl === null) return;
        var token = prompt('Bearer token playback API (необязательно):', current.provider_token);
        if (token === null) return;
        save({tmdb_key: key.trim(), tmdb_language: current.tmdb_language, provider_url: providerUrl.trim(), provider_token: token.trim()});
        alert('Настройки сохранены. Откройте раздел «Моя библиотека» заново.');
    }

    function renderCard(item) {
        return '<div class="cinema-card selector" data-id="' + item.id + '" data-type="' + item.type + '" tabindex="0">' +
            '<img src="' + escapeHtml(item.poster) + '" loading="lazy"><div class="cinema-card__title">' + escapeHtml(item.title) + '</div>' +
            '<div class="cinema-card__meta">' + escapeHtml(item.year) + ' · ★ ' + escapeHtml(item.rating) + '</div></div>';
    }

    function styles() {
        if (document.getElementById(PLUGIN + '_style')) return;
        var style = document.createElement('style');
        style.id = PLUGIN + '_style';
        style.textContent = '.cinema-wrap{padding:1.5em}.cinema-toolbar{display:flex;gap:.7em;margin-bottom:1.2em}.cinema-toolbar input{flex:1;background:#282828;color:#fff;border:1px solid #555;border-radius:4px;padding:.8em;font-size:1em}.cinema-toolbar button,.cinema-detail button{background:#e5a900;color:#111;border:0;border-radius:4px;padding:.8em 1em;font-weight:600}.cinema-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:1em}.cinema-card{min-width:0}.cinema-card img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:5px;background:#222}.cinema-card__title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.35em}.cinema-card__meta{color:#aaa;font-size:.85em;margin-top:.2em}.cinema-detail{max-width:800px;padding:1.5em;background:#1d1d1d;border-radius:6px}.cinema-detail h2{margin-top:0}.cinema-detail__sources{display:flex;flex-wrap:wrap;gap:.5em;margin-top:1em}.cinema-error{color:#ffb0b0;padding:1em}@media(max-width:600px){.cinema-wrap{padding:1em}.cinema-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:.6em}.cinema-card__title{font-size:.85em}}';
        document.head.appendChild(style);
    }

    function openDetails(item) {
        provider(item).then(function (sources) {
            var sourceHtml = sources.length ? sources.map(function (source) {
                var url = source.url || source.file;
                return '<button class="selector cinema-play" data-url="' + escapeHtml(url) + '">' + escapeHtml(source.title || source.name || 'Плеер') + '</button>';
            }).join('') : '<div>Для этого тайтла нет подключённых источников.</div>';
            var html = '<div class="cinema-detail"><h2>' + escapeHtml(item.title) + '</h2><p>' + escapeHtml(item.overview) + '</p><p>★ ' + item.rating + (item.year ? ' · ' + item.year : '') + '</p><div class="cinema-detail__sources">' + sourceHtml + '</div></div>';
            var modal = Lampa.Modal.open({title: item.title, html: html, size: 'medium'});
            $(modal).find('.cinema-play').on('hover:focus', function () { Lampa.Controller.collectionSet($(modal).find('.cinema-play')); });
            $(modal).find('.cinema-play').on('click', function () {
                var url = $(this).data('url');
                if (url) Lampa.Player.play({url: url, title: item.title});
            });
        }).catch(function (error) {
            alert('Не удалось получить источники: ' + error.message);
        });
    }

    function openCatalog() {
        styles();
        var currentPage = 1;
        var root = $('<div class="cinema-wrap"><div class="cinema-toolbar"><input class="cinema-query" placeholder="Поиск фильмов и сериалов"><button class="selector cinema-search">Найти</button><button class="selector cinema-settings">Настройки</button></div><div class="cinema-grid"></div><div class="cinema-error"></div></div>');
        var grid = root.find('.cinema-grid');
        var error = root.find('.cinema-error');
        function load(path, params) {
            error.empty();
            grid.html('<div>Загрузка каталога...</div>');
            tmdb(path, Object.assign({page: currentPage}, params || {})).then(function (data) {
                var items = (data.results || []).map(normalise).filter(function (item) { return item.poster; });
                grid.html(items.map(renderCard).join('') || '<div>Ничего не найдено.</div>');
                grid.find('.cinema-card').on('click', function () { openDetails(items.find(function (item) { return String(item.id) === String($(this).data('id')); })); });
            }).catch(function (e) { grid.empty(); error.text(e.message + '. Откройте «Настройки» и укажите ключ TMDB.'); });
        }
        root.find('.cinema-search').on('click', function () { currentPage = 1; var query = root.find('.cinema-query').val().trim(); load(query ? '/search/multi' : '/trending/all/week', query ? {query: query} : {}); });
        root.find('.cinema-query').on('keypress', function (event) { if (event.key === 'Enter') root.find('.cinema-search').click(); });
        root.find('.cinema-settings').on('click', settings);
        load('/trending/all/week');
        Lampa.Activity.push({title: 'Моя библиотека', component: 'lampa_cinema_view', page: 1, source: 'lampa_cinema'});
        return root;
    }

    function start() {
        if (!window.Lampa || !window.$ || window[PLUGIN]) return;
        window[PLUGIN] = true;
        Lampa.Component.add('lampa_cinema_view', {create: function () { this.activity.loader(false); this.html = openCatalog(); this.activity.append(this.html); }, destroy: function () {}});
        if (Lampa.Menu && Lampa.Menu.add) Lampa.Menu.add('lampa_cinema', 'Моя библиотека', 'view', function () { Lampa.Activity.push({component: 'lampa_cinema_view', title: 'Моя библиотека', page: 1}); });
    }

    if (window.Lampa) start();
    else document.addEventListener('lampa_ready', start, {once: true});
}());
