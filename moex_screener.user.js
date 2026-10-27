// ==UserScript==
// @name         MOEX T-Bank Terminal All-Stocks Live Screener Pro (v17.15)
// @namespace    http://tampermonkey.net/
// @version      17.15
// @description  Единый скринер акций Мосбиржи (5m, 15m, 1h, 4h) для Терминала Т-Банка: чистый статус без эмодзи кружков, нативная кнопка закрытия (✕), фоновый мониторинг
// @author       You
// @match        *://*.tbank.ru/terminal/*
// @match        *://*.tinkoff.ru/terminal/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// @connect      invest-public-api.tinkoff.ru
// @connect      api.telegram.org
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const FALLBACK_BLUE_CHIPS = [
        "SBER", "GAZP", "LKOH", "ROSN", "NVTK", "YDEX", "T", "SIBN", "GMKN", "TATN",
        "PLZL", "SNGS", "SNGSP", "CHMF", "NLMK", "MAGN", "ALRS", "MOEX", "VTBR", "MTSS",
        "PHOR", "IRAO", "RUAL", "AFLT", "PIKK", "OZON", "POSI", "AFKS", "HYDR", "FEES",
        "TRNFP", "CBOM", "SOVCOM", "BSPB", "FLOT", "ASTR", "HEAD", "VKCO", "SELG", "UGLD"
    ];

    // Хост виджета с изолированным Shadow DOM
    const host = document.createElement('div');
    host.id = 'tv-moex-screener-host';
    host.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; transform: translate3d(0, 0, 0);';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        #widget {
            width: 720px;
            height: 520px;
            display: flex;
            flex-direction: column;
            background-color: #131722;
            color: #d1d4dc;
            border: 1px solid #363a45;
            border-radius: 8px;
            box-shadow: 0 14px 42px rgba(0,0,0,0.92);
            font-size: 12px;
            user-select: none;
            overflow: hidden;
            position: relative;
            contain: layout style;
        }
        #header {
            background-color: #1e222d;
            padding: 7px 12px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #363a45;
            font-size: 12px;
            gap: 8px;
        }
        .live-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            color: #d1d4dc;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .live-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            display: inline-block;
            flex-shrink: 0;
        }
        .dot-green {
            background-color: #00e676;
            box-shadow: 0 0 6px #00e676;
        }
        .dot-yellow {
            background-color: #ffd600;
            box-shadow: 0 0 6px #ffd600;
        }
        .dot-gray {
            background-color: #787b86;
        }
        .dot-red {
            background-color: #ff5252;
            box-shadow: 0 0 6px #ff5252;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 700;
            color: #fff;
            letter-spacing: 0.2px;
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .hdr-icon-btn {
            width: 26px;
            height: 26px;
            min-width: 26px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            box-sizing: border-box;
            border-radius: 6px;
        }
        .hdr-icon-btn svg {
            width: 15px;
            height: 15px;
            display: block;
            flex-shrink: 0;
            fill: currentColor;
        }
        .hdr-icon-btn svg path {
            fill: currentColor;
        }
        .hdr-btn {
            background: #2a2e39;
            border: 1px solid #363a45;
            color: #d1d4dc;
            border-radius: 4px;
            padding: 4px 9px;
            font-size: 11px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .hdr-btn:hover { background: #363a45; color: #fff; }
        .hdr-btn.active-on {
            background: rgba(182, 182, 182, 0.25);
            border: 1px solid #363a45;
            color: #fff;
        }

        /* Панель фильтров над таблицей */
        .filter-toolbar {
            background-color: #181c27;
            border-bottom: 1px solid #2a2e39;
            padding: 6px 8px;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            z-index: 10;
            position: relative;
        }

        /* Выпадающее меню списков акций в панели фильтров */
        .list-dropdown-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
        }
        .hdr-list-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 500;
            height: 24px;
            background: transparent;
            border: 1px solid #363a45;
            color: #d1d4dc;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .hdr-list-btn:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: #434651;
            color: #fff;
        }
        .hdr-list-btn.active-filter {
            border-color: #2962ff;
            color: #2979ff;
            background: rgba(41, 98, 255, 0.08);
        }
        .dropdown-caret {
            font-size: 8px;
            color: #787b86;
            margin-left: 3px;
            line-height: 1;
        }
        .list-dropdown-menu {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.9);
            min-width: 140px;
            z-index: 100;
            overflow: hidden;
            animation: menuFadeIn 0.12s ease-out;
        }
        @keyframes menuFadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .list-menu-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            font-size: 11px;
            color: #d1d4dc;
            cursor: pointer;
            transition: background-color 0.12s, color 0.12s;
        }
        .list-menu-item:hover {
            background-color: #2a2e39;
            color: #fff;
        }
        .list-menu-item.active {
            background-color: rgba(41, 98, 255, 0.15);
            color: #2962ff;
            font-weight: 600;
        }
        .list-menu-item .menu-text {
            flex: 1;
            white-space: nowrap;
        }
        .list-menu-item .menu-check {
            font-size: 10px;
            color: #2962ff;
            font-weight: bold;
        }

        /* Выпадающее меню целевой группы графика (Т-Терминал) */
        /* Нативный цветной кружок группы Т-Терминала в крайнем левом углу */
        .header-left-cluster {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        .group-select-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .tbank-group-circle-btn {
            background: transparent;
            border: none;
            outline: none;
            cursor: pointer;
            padding: 3px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: transform 0.15s ease, background-color 0.15s ease;
        }
        .tbank-group-circle-btn:hover {
            background-color: rgba(255, 255, 255, 0.1);
            transform: scale(1.15);
        }
        .tbank-group-circle {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
            background-color: #2979ff;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
            transition: background-color 0.2s ease, box-shadow 0.2s ease;
            flex-shrink: 0;
        }
        .group-dropdown-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 6px;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
            z-index: 1000;
            min-width: 145px;
            padding: 4px 0;
            animation: menuFadeIn 0.15s ease-out;
        }
        .group-dropdown-menu.show {
            display: block;
        }
        .group-menu-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            font-size: 11px;
            color: #d1d4dc;
            cursor: pointer;
            transition: background-color 0.12s, color 0.12s;
        }
        .group-menu-item:hover {
            background-color: #2a2e39;
            color: #fff;
        }
        .group-menu-item.active {
            background-color: rgba(41, 98, 255, 0.15);
            color: #2979ff;
            font-weight: 600;
        }
        .group-menu-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            flex-shrink: 0;
        }
        .group-menu-text {
            flex: 1;
            white-space: nowrap;
        }
        .group-menu-check {
            font-size: 10px;
            color: #2979ff;
            font-weight: bold;
        }

        /* Выдвижное поле поиска в шапке */
        .search-box-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
        }
        .search-input-container {
            display: none;
            align-items: center;
            background: #181c27;
            border: 1px solid #2962ff;
            border-radius: 4px;
            padding: 2px 7px;
            height: 26px;
            width: 140px;
            box-shadow: 0 0 10px rgba(41, 98, 255, 0.3);
            animation: searchExpand 0.16s ease-out;
        }
        @keyframes searchExpand {
            from { width: 28px; opacity: 0; }
            to { width: 140px; opacity: 1; }
        }
        .search-icon-inside {
            font-size: 11px;
            margin-right: 5px;
            color: #787b86;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .search-icon-inside svg {
            width: 14px;
            height: 14px;
            display: block;
            flex-shrink: 0;
            fill: currentColor;
        }
        .search-icon-inside svg path {
            fill: currentColor;
        }
        #header-search-input {
            background: transparent;
            border: none;
            outline: none;
            color: #fff;
            font-size: 11px;
            width: 100%;
            padding: 0;
            line-height: 1;
        }
        #header-search-input::placeholder {
            color: #787b86;
        }
        .search-clear-btn {
            background: none;
            border: none;
            color: #787b86;
            cursor: pointer;
            padding: 0 2px;
            font-size: 11px;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: color 0.15s;
        }
        .search-clear-btn:hover {
            color: #ff5252;
        }
        #body {
            padding: 0;
            position: relative;
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        /* Вкладки настроек (4 равных модуля) — полноэкранный режим */
        #settings-panel {
            display: none;
            background: #141722;
            padding: 12px 14px;
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }
        .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid #2a2e39;
            font-weight: bold;
            color: #fff;
            font-size: 13px;
        }
        .settings-nav {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
            border-bottom: 1px solid #2a2e39;
            margin-bottom: 10px;
        }
        .settings-tab-btn {
            background: #141722;
            border: 1px solid #2a2e39;
            border-bottom: none;
            color: #787b86;
            padding: 7px 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 4px 4px 0 0;
            transition: all 0.15s;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .settings-tab-btn:hover { color: #fff; background: #1e222d; }
        .settings-tab-btn.active {
            color: #2962ff;
            border-color: #2962ff #2962ff #131722 #2962ff;
            background: #131722;
        }
        .settings-tab-pane { display: none; }
        .settings-tab-pane.active { display: block; }

        /* Карточки параметров */
        .cfg-card {
            background: #131722;
            border: 1px solid #2a2e39;
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 8px;
        }
        .cfg-card-title {
            font-weight: bold;
            color: #e0e3eb;
            font-size: 11px;
            margin-bottom: 3px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .cfg-card-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cfg-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .cfg-grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
        }
        .val-badge {
            background: rgba(41, 121, 255, 0.2);
            color: #2979ff;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
        }
        .cfg-field {
            display: flex;
            flex-direction: column;
            gap: 3px;
            margin-bottom: 6px;
        }
        .cfg-field label {
            font-size: 10px;
            color: #b2b5be;
            font-weight: 600;
        }

        .val-badge-dual {
            display: inline-flex;
            gap: 4px;
            font-size: 10px;
            font-weight: bold;
        }
        .badge-low {
            background: rgba(8, 153, 129, 0.25);
            color: #00e676;
            padding: 1px 5px;
            border-radius: 3px;
        }
        .badge-high {
            background: rgba(242, 54, 69, 0.25);
            color: #ff5252;
            padding: 1px 5px;
            border-radius: 3px;
        }
        input[type="range"] { width: 100%; cursor: pointer; accent-color: #2962ff; margin-top: 4px; }

        .wl-chips-container {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            max-height: 120px;
            overflow-y: auto;
            background: #181c27;
            padding: 6px;
            border: 1px solid #2a2e39;
            border-radius: 4px;
            margin-top: 6px;
        }
        .wl-chip {
            background: #2a2e39;
            color: #d1d4dc;
            border: 1px solid #363a45;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .wl-chip-del {
            cursor: pointer;
            color: #787b86;
            font-size: 11px;
            line-height: 1;
            padding: 0 1px;
        }
        .wl-chip-del:hover {
            color: #f23645;
        }

        select, input[type="text"] {
            background: #1e222d;
            border: 1px solid #363a45;
            color: #fff;
            padding: 4px 7px;
            border-radius: 4px;
            font-size: 11px;
            outline: none;
            width: 100%;
        }
        select:focus, input[type="text"]:focus {
            border-color: #2962ff;
        }
        button.action-btn {
            background-color: #2962ff;
            color: #fff;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 11px;
        }
        button.action-btn:hover { background-color: #1e53e5; }
        button.secondary-btn {
            background-color: #2a2e39;
            color: #d1d4dc;
            border: 1px solid #363a45;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        button.secondary-btn:hover { background-color: #363a45; color: #fff; }

        /* Бесшовная таблица Edge-to-Edge в нативном стиле TradingView */
        .table-container {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            border: none;
            border-radius: 0;
            background: #131722;
        }

        /* Тонкий нативный скроллбар TradingView */
        .table-container::-webkit-scrollbar,
        #settings-panel::-webkit-scrollbar {
            width: 5px;
            height: 5px;
        }
        .table-container::-webkit-scrollbar-track,
        #settings-panel::-webkit-scrollbar-track {
            background: transparent;
        }
        .table-container::-webkit-scrollbar-thumb,
        #settings-panel::-webkit-scrollbar-thumb {
            background: #2a2e39;
            border-radius: 3px;
        }
        .table-container::-webkit-scrollbar-thumb:hover,
        #settings-panel::-webkit-scrollbar-thumb:hover {
            background: #434651;
        }

        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        thead th {
            position: sticky;
            top: 0;
            background-color: #181c27;
            color: #787b86;
            padding: 7px 6px;
            border-bottom: 1px solid #2a2e39;
            text-align: center;
            z-index: 2;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.15s, color 0.15s;
        }
        thead th:hover {
            background-color: #1e222d;
            color: #d1d4dc;
        }
        thead th:first-child, tbody td:first-child {
            padding-left: 12px;
            text-align: left;
        }
        thead th:last-child, tbody td:last-child {
            padding-right: 12px;
        }
        .sort-arrow {
            color: #2962ff;
            font-size: 10px;
            margin-left: 2px;
        }
        tbody td {
            padding: 5px 6px;
            border-bottom: 1px solid #1a1e29;
            text-align: center;
            height: 30px;
        }
        tbody tr {
            transition: background-color 0.1s;
            content-visibility: auto;
            contain-intrinsic-size: auto 30px;
        }
        tbody tr:hover { background-color: #1e222d; }
        tbody tr.row-active-ticker {
            background-color: rgba(41, 121, 255, 0.18) !important;
            border-left: 3px solid #2979ff !important;
        }

        /* Нижняя информационная панель: статус и обновление слева, ротация ТФ справа */
        #footer-bar {
            height: 24px;
            background-color: #181c27;
            border-top: 1px solid #2a2e39;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 600;
            color: #d1d4dc;
            user-select: none;
            padding: 0 12px;
        }
        .footer-left {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .footer-refresh-btn {
            background: none;
            border: none;
            padding: 0;
            margin: 0;
            color: #787b86;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 3px;
            transition: color 0.15s, background-color 0.15s;
        }
        .footer-refresh-btn:hover {
            color: #2962ff;
            background-color: #1e222d;
        }
        .footer-refresh-btn svg {
            width: 14px;
            height: 14px;
            display: block;
        }
        .footer-refresh-btn.spinning svg {
            animation: spin 0.75s linear infinite;
        }
        @keyframes spin {
            100% { transform: rotate(360deg); }
        }
        #status-text {
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background-color 0.15s;
        }
        #status-text:hover {
            background-color: #1e222d;
        }
        #footer-text {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
            transition: opacity 0.2s ease-in-out, background-color 0.15s;
        }
        #footer-text:hover {
            background-color: #1e222d;
        }
        .footer-badge-tf {
            color: #2962ff;
            font-weight: 700;
            margin-right: 3px;
        }
        .footer-lbl {
            color: #787b86;
            font-weight: 600;
            font-size: 10px;
            margin-right: 1px;
        }
        .footer-val-long {
            color: #00e676;
            font-weight: bold;
        }
        .footer-val-short {
            color: #ff5252;
            font-weight: bold;
        }
        .footer-sep {
            color: #434651;
            margin: 0 2px;
            font-weight: normal;
        }
        .footer-dot {
            color: #5d606b;
            margin: 0 5px;
        }
        .footer-right {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .resize-handle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: nwse-resize;
            color: #5d606b;
            padding: 2px;
            margin-left: 6px;
            border-radius: 2px;
            transition: color 0.15s, background-color 0.15s;
            user-select: none;
            flex-shrink: 0;
        }
        .resize-handle:hover, .resize-handle.active-resizing {
            color: #2962ff;
            background-color: rgba(41, 98, 255, 0.2);
        }
        .star-btn {
            cursor: pointer;
            font-size: 14px;
            margin-right: 4px;
            color: #434651;
            transition: color 0.15s;
        }
        .star-btn.starred { color: #f0b90b; }
        .star-btn:hover { color: #ffd54f; }
        .ticker-link {
            font-weight: bold;
            color: #fff;
            cursor: pointer;
        }
        .ticker-link:hover { color: #2962ff; text-decoration: underline; }
        .sub-name {
            display: block;
            font-size: 9px;
            color: #787b86;
            font-weight: normal;
            max-width: 120px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .chg-pos { color: #089981; font-weight: bold; font-size: 10px; }
        .chg-neg { color: #f23645; font-weight: bold; font-size: 10px; }
        .chg-zero { color: #787b86; font-size: 10px; }

        /* Бейджи объемов RVOL */
        .badge-spike {
            background: linear-gradient(135deg, rgba(255, 109, 0, 0.25), rgba(242, 54, 69, 0.3));
            border: 1px solid #ff6d00;
            color: #ff9e80;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 9px;
            margin-left: 4px;
            display: inline-block;
        }
        .badge-rvol-active {
            background: rgba(41, 98, 255, 0.2);
            color: #82b1ff;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 9px;
            margin-left: 4px;
            display: inline-block;
        }

        /* Двухцветная автоматическая подсветка ячеек ТФ */
        .signal-both-long {
            background-color: rgba(8, 153, 129, 0.35);
            color: #00e676;
            font-weight: bold;
            border-radius: 3px;
        }
        .signal-both-short {
            background-color: rgba(242, 54, 69, 0.35);
            color: #ff5252;
            font-weight: bold;
            border-radius: 3px;
        }
        .signal-one-long {
            background-color: rgba(8, 153, 129, 0.16);
            color: #81c784;
            border-radius: 3px;
        }
        .signal-one-short {
            background-color: rgba(242, 54, 69, 0.16);
            color: #e57373;
            border-radius: 3px;
        }

        /* Бейджи статуса */
        .badge-climax-long {
            background: linear-gradient(135deg, rgba(255, 109, 0, 0.3), rgba(8, 153, 129, 0.35));
            border: 1px solid #ff9100;
            color: #ffd180;
            padding: 2px 5px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10px;
        }
        .badge-climax-short {
            background: linear-gradient(135deg, rgba(255, 109, 0, 0.3), rgba(242, 54, 69, 0.35));
            border: 1px solid #ff3d00;
            color: #ff8a80;
            padding: 2px 5px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10px;
        }
        .badge-strong-long {
            background: rgba(8, 153, 129, 0.25);
            color: #00e676;
            padding: 2px 5px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10px;
        }
        .badge-strong-short {
            background: rgba(242, 54, 69, 0.25);
            color: #ff5252;
            padding: 2px 5px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10px;
        }
        .badge-norm { color: #5d606b; font-size: 10px; }
        .badge-nodata { color: #787b86; font-size: 10px; font-style: italic; }
        .cooldown-dot {
            display: inline-block;
            font-size: 9px;
            color: #f0b90b;
            margin-left: 3px;
        }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.id = 'widget';
    container.innerHTML = `
        <div id="header">
            <!-- Левая часть: нативный цветной кружок группы Т-Терминала -->
            <div class="header-left-cluster">
                <div class="group-select-wrapper" id="group-select-wrapper">
                    <button class="tbank-group-circle-btn" id="group-select-btn" title="Группа графика (клик для смены)">
                        <span class="tbank-group-circle" id="header-group-dot"></span>
                    </button>
                    <div class="group-dropdown-menu" id="group-dropdown-menu">
                        <div class="group-menu-item active" data-group="auto">
                            <span class="group-menu-dot" style="background-color: #2979ff;"></span>
                            <span class="group-menu-text">Авто</span>
                            <span class="group-menu-check">✓</span>
                        </div>
                        <div class="group-menu-item" data-group="group1">
                            <span class="group-menu-dot" style="background-color: rgb(255, 212, 80);"></span>
                            <span class="group-menu-text">Группа 1</span>
                            <span class="group-menu-check"></span>
                        </div>
                        <div class="group-menu-item" data-group="group2">
                            <span class="group-menu-dot" style="background-color: rgb(255, 123, 118);"></span>
                            <span class="group-menu-text">Группа 2</span>
                            <span class="group-menu-check"></span>
                        </div>
                        <div class="group-menu-item" data-group="group3">
                            <span class="group-menu-dot" style="background-color: rgb(163, 129, 255);"></span>
                            <span class="group-menu-text">Группа 3</span>
                            <span class="group-menu-check"></span>
                        </div>
                        <div class="group-menu-item" data-group="group4">
                            <span class="group-menu-dot" style="background-color: rgb(77, 195, 247);"></span>
                            <span class="group-menu-text">Группа 4</span>
                            <span class="group-menu-check"></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Действия в шапке: поиск, настройки и сворачивание -->
            <div class="header-actions">
                <div class="search-box-wrapper" id="search-box-wrapper">
                    <button class="hdr-btn hdr-icon-btn" id="search-btn" title="Поиск по тикеру или названию">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.04762 12.0952C4.2599 12.0952 2 9.83534 2 7.04762C2 4.2599 4.2599 2 7.04762 2C9.83534 2 12.0952 4.2599 12.0952 7.04762C12.0952 8.09727 11.7748 9.07209 11.2265 9.87962L13.7211 12.3741C14.093 12.7461 14.093 13.3491 13.7211 13.721C13.3491 14.0929 12.7461 14.0929 12.3742 13.721L9.87966 11.2265C9.07212 11.7748 8.09729 12.0952 7.04762 12.0952ZM7.04759 10.4129C8.90607 10.4129 10.4127 8.90627 10.4127 7.04779C10.4127 5.1893 8.90607 3.68271 7.04759 3.68271C5.1891 3.68271 3.68251 5.1893 3.68251 7.04779C3.68251 8.90627 5.1891 10.4129 7.04759 10.4129Z" fill="currentColor"></path></svg>
                    </button>
                    <div class="search-input-container" id="search-input-container">
                        <span class="search-icon-inside">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.04762 12.0952C4.2599 12.0952 2 9.83534 2 7.04762C2 4.2599 4.2599 2 7.04762 2C9.83534 2 12.0952 4.2599 12.0952 7.04762C12.0952 8.09727 11.7748 9.07209 11.2265 9.87962L13.7211 12.3741C14.093 12.7461 14.093 13.3491 13.7211 13.721C13.3491 14.0929 12.7461 14.0929 12.3742 13.721L9.87966 11.2265C9.07212 11.7748 8.09729 12.0952 7.04762 12.0952ZM7.04759 10.4129C8.90607 10.4129 10.4127 8.90627 10.4127 7.04779C10.4127 5.1893 8.90607 3.68271 7.04759 3.68271C5.1891 3.68271 3.68251 5.1893 3.68251 7.04779C3.68251 8.90627 5.1891 10.4129 7.04759 10.4129Z" fill="currentColor"></path></svg>
                        </span>
                        <input type="text" id="header-search-input" placeholder="Поиск тикера..." spellcheck="false" autocomplete="off">
                        <button class="search-clear-btn" id="search-clear-btn" title="Очистить и закрыть">✕</button>
                    </div>
                </div>
                <button class="hdr-btn hdr-icon-btn" id="settings-btn" title="Параметры скринера (фильтры, пороги, алерты)">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M6.85474 13.7568C6.8588 13.8056 6.86083 13.83 6.87126 13.85C6.8803 13.8674 6.89449 13.8828 6.91106 13.8933C6.93018 13.9053 6.95364 13.9093 7.00058 13.9171C7.3256 13.9716 7.65949 14 8 14C8.34051 14 8.67439 13.9716 8.99942 13.9171C9.04635 13.9093 9.06982 13.9053 9.08894 13.8933C9.10551 13.8828 9.1197 13.8674 9.12874 13.85C9.13917 13.83 9.1412 13.8056 9.14526 13.7568L9.25476 12.4429C9.25846 12.3985 9.2603 12.3763 9.26877 12.3582C9.27642 12.3417 9.28708 12.3283 9.30135 12.3171C9.31713 12.3047 9.33913 12.2976 9.38313 12.2834C9.61434 12.2088 9.83738 12.116 10.0506 12.0067C10.0917 11.9856 10.1123 11.9751 10.1322 11.9726C10.1502 11.9705 10.1672 11.9724 10.1843 11.9786C10.2031 11.9855 10.2201 11.9999 10.2541 12.0287L11.2605 12.8802C11.2979 12.9118 11.3165 12.9276 11.3381 12.9344C11.3567 12.9403 11.3777 12.9412 11.3968 12.9368C11.4188 12.9319 11.4382 12.9181 11.477 12.8904C12.0232 12.5014 12.5014 12.0231 12.8905 11.4769C12.9181 11.4382 12.9319 11.4188 12.9369 11.3968C12.9412 11.3777 12.9403 11.3567 12.9344 11.338C12.9276 11.3165 12.9118 11.2978 12.8802 11.2605L12.0287 10.2541C11.9999 10.2201 11.9855 10.2031 11.9786 10.1843C11.9724 10.1672 11.9705 10.1502 11.9727 10.1322C11.9751 10.1122 11.9856 10.0917 12.0067 10.0505C12.116 9.83736 12.2088 9.61434 12.2834 9.38313C12.2976 9.33913 12.3047 9.31713 12.3171 9.30135C12.3283 9.28708 12.3417 9.27642 12.3582 9.26877C12.3763 9.26031 12.3985 9.25846 12.4429 9.25476L13.7568 9.14526C13.8056 9.1412 13.83 9.13917 13.85 9.12874C13.8674 9.1197 13.8828 9.10551 13.8933 9.08894C13.9053 9.06982 13.9093 9.04636 13.9171 8.99942C13.9714 8.67573 13.9998 8.34325 14 8.00419V7.99581C13.9998 7.65675 13.9714 7.32427 13.9171 7.00058C13.9093 6.95365 13.9053 6.93018 13.8933 6.91106C13.8828 6.89449 13.8674 6.8803 13.85 6.87126C13.83 6.86083 13.8056 6.8588 13.7568 6.85474L12.4429 6.74524C12.3985 6.74154 12.3763 6.7397 12.3582 6.73123C12.3417 6.72358 12.3283 6.71292 12.3171 6.69865C12.3047 6.68287 12.2976 6.66087 12.2834 6.61687C12.2088 6.38567 12.116 6.16265 12.0067 5.9495C11.9856 5.90835 11.9751 5.88777 11.9727 5.86786C11.9705 5.84985 11.9724 5.83281 11.9786 5.81577C11.9855 5.79692 11.9999 5.77992 12.0287 5.74591L12.8802 4.73954C12.9118 4.70219 12.9276 4.68352 12.9344 4.66198C12.9403 4.6433 12.9412 4.62237 12.9369 4.60327C12.9319 4.58123 12.9181 4.56185 12.8905 4.52309C12.5014 3.97687 12.0232 3.49861 11.477 3.10957C11.4382 3.08196 11.4188 3.06815 11.3968 3.06317C11.3777 3.05884 11.3568 3.05972 11.3381 3.06562C11.3165 3.07242 11.2979 3.08822 11.2605 3.11983L10.2542 3.97136C10.2202 4.00014 10.2031 4.01453 10.1843 4.02139C10.1673 4.0276 10.1502 4.02956 10.1322 4.02737C10.1123 4.02495 10.0917 4.01439 10.0506 3.99329C9.83739 3.88397 9.61435 3.79116 9.38313 3.71656C9.33913 3.70236 9.31713 3.69526 9.30135 3.6829C9.28708 3.67171 9.27642 3.65828 9.26877 3.64184C9.2603 3.62367 9.25845 3.60148 9.25476 3.5571L9.14526 2.24317C9.1412 2.1944 9.13917 2.17002 9.12874 2.14997C9.1197 2.13259 9.10551 2.11717 9.08894 2.10672C9.06982 2.09467 9.04635 2.09073 8.99942 2.08286C8.67439 2.02837 8.34051 2 8 2C7.65949 2 7.3256 2.02837 7.00058 2.08286C6.95364 2.09073 6.93018 2.09467 6.91106 2.10672C6.89449 2.11717 6.8803 2.13259 6.87126 2.14997C6.86083 2.17002 6.8588 2.1944 6.85473 2.24317L6.74524 3.5571C6.74154 3.60148 6.73969 3.62367 6.73123 3.64184C6.72358 3.65829 6.71292 3.67171 6.69865 3.6829C6.68287 3.69526 6.66087 3.70236 6.61687 3.71656C6.38566 3.79116 6.16264 3.88396 5.94947 3.99327C5.90832 4.01437 5.88775 4.02492 5.86784 4.02734C5.84983 4.02953 5.83279 4.02758 5.81574 4.02137C5.7969 4.0145 5.77989 4.00011 5.74588 3.97133L4.73952 3.1198C4.70217 3.08819 4.6835 3.07239 4.66195 3.06559C4.64328 3.05969 4.62235 3.05881 4.60324 3.06314C4.58121 3.06812 4.56183 3.08193 4.52307 3.10954C4.25261 3.30216 3.99882 3.51666 3.76427 3.75046L3.75046 3.76427C3.51667 3.99882 3.30218 4.2526 3.10955 4.52304C3.08195 4.5618 3.06814 4.58118 3.06316 4.60322C3.05883 4.62232 3.05971 4.64325 3.0656 4.66193C3.07241 4.68347 3.08821 4.70215 3.11981 4.7395L3.97135 5.74586C4.00013 5.77987 4.01452 5.79687 4.02138 5.81572C4.02759 5.83276 4.02955 5.8498 4.02736 5.86781C4.02494 5.88772 4.01438 5.9083 3.99328 5.94945C3.88397 6.16262 3.79116 6.38566 3.71656 6.61687C3.70236 6.66087 3.69526 6.68287 3.6829 6.69865C3.67171 6.71292 3.65828 6.72358 3.64184 6.73123C3.62367 6.7397 3.60148 6.74154 3.5571 6.74524L2.24317 6.85474C2.1944 6.8588 2.17002 6.86083 2.14997 6.87126C2.13259 6.8803 2.11717 6.89449 2.10672 6.91106C2.09467 6.93018 2.09073 6.95365 2.08286 7.00058C2.02837 7.32561 2 7.65949 2 8C2 8.34051 2.02837 8.6744 2.08286 8.99942C2.09073 9.04636 2.09467 9.06982 2.10672 9.08894C2.11717 9.10551 2.13259 9.1197 2.14997 9.12874C2.17002 9.13917 2.1944 9.1412 2.24317 9.14527L3.5571 9.25476C3.60148 9.25846 3.62367 9.26031 3.64184 9.26877C3.65829 9.27642 3.67171 9.28708 3.6829 9.30135C3.69526 9.31713 3.70236 9.33913 3.71656 9.38313C3.79117 9.61435 3.88397 9.8374 3.99329 10.0506C4.0144 10.0917 4.02495 10.1123 4.02737 10.1322C4.02956 10.1502 4.02761 10.1673 4.02139 10.1843C4.01453 10.2032 4.00014 10.2202 3.97136 10.2542L3.11983 11.2605C3.08822 11.2979 3.07242 11.3165 3.06562 11.3381C3.05972 11.3568 3.05885 11.3777 3.06317 11.3968C3.06816 11.4188 3.08196 11.4382 3.10957 11.477C3.30063 11.7452 3.51321 11.9971 3.74479 12.23L3.76997 12.2552C4.00293 12.4868 4.25481 12.6994 4.52309 12.8905C4.56185 12.9181 4.58123 12.9319 4.60326 12.9369C4.62237 12.9412 4.6433 12.9403 4.66197 12.9344C4.68352 12.9276 4.70219 12.9118 4.73954 12.8802L5.7459 12.0287C5.77992 11.9999 5.79692 11.9855 5.81576 11.9786C5.83281 11.9724 5.84985 11.9705 5.86786 11.9727C5.88777 11.9751 5.90834 11.9856 5.94949 12.0067C6.16265 12.116 6.38567 12.2088 6.61687 12.2834C6.66087 12.2976 6.68287 12.3047 6.69865 12.3171C6.71292 12.3283 6.72358 12.3417 6.73123 12.3582C6.73969 12.3763 6.74154 12.3985 6.74524 12.4429L6.85474 13.7568ZM10.25 8C10.25 9.24264 9.24264 10.25 8 10.25C6.75736 10.25 5.75 9.24264 5.75 8C5.75 6.75736 6.75736 5.75 8 5.75C9.24264 5.75 10.25 6.75736 10.25 8Z"></path></svg>
                </button>
                <button class="hdr-btn hdr-icon-btn" id="close-widget-btn" title="Закрыть скринер">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" fill="currentColor"></path></svg>
                </button>
            </div>
        </div>
        <div id="body">
            <!-- Окно настроек (3 модуля) -->
            <div id="settings-panel">
                <div class="settings-header">
                    <span>Параметры скринера</span>
                    <button class="secondary-btn" id="close-settings-btn">✕ Закрыть</button>
                </div>

                <div class="settings-nav">
                    <button class="settings-tab-btn active" data-tab="tab-analysis">Сигналы & Анализ</button>
                    <button class="settings-tab-btn" data-tab="tab-alerts">Оповещения</button>
                    <button class="settings-tab-btn" data-tab="tab-system">Система & Списки</button>
                </div>

                <!-- МОДУЛЬ 1: Сигналы & Анализ -->
                <div class="settings-tab-pane active" id="tab-analysis">
                    <!-- БЛОК 1: ПЕРИОДЫ ИНДИКАТОРОВ -->
                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Периоды индикаторов</span>
                        </div>
                        <div class="cfg-grid-3">
                            <div class="cfg-field">
                                <label style="display:flex; justify-content:space-between;">
                                    <span>Период RSI:</span>
                                    <span class="val-badge" id="rsi-period-badge">14</span>
                                </label>
                                <input type="range" id="rsi-period-slider" min="2" max="30" value="14" step="1">
                            </div>
                            <div class="cfg-field">
                                <label style="display:flex; justify-content:space-between;">
                                    <span>Период Stoch %K:</span>
                                    <span class="val-badge" id="stoch-period-badge">14</span>
                                </label>
                                <input type="range" id="stoch-period-slider" min="3" max="30" value="14" step="1">
                            </div>
                            <div class="cfg-field">
                                <label style="display:flex; justify-content:space-between;">
                                    <span>База RVOL (дней):</span>
                                    <span class="val-badge" id="rvol-days-badge">10 дн</span>
                                </label>
                                <input type="range" id="rvol-days-slider" min="3" max="30" value="10" step="1">
                            </div>
                        </div>
                    </div>

                    <!-- БЛОК 2: СИММЕТРИЧНЫЕ ПОРОГИ -->
                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Симметричные пороги RSI и Stoch</span>
                        </div>
                        <div class="cfg-grid-2">
                            <div class="cfg-field">
                                <label style="display:flex; justify-content:space-between;">
                                    <span>Порог RSI:</span>
                                    <div class="val-badge-dual">
                                        <span class="badge-low" id="rsi-val-low">≤ 30</span>
                                        <span class="badge-high" id="rsi-val-high">≥ 70</span>
                                    </div>
                                </label>
                                <input type="range" id="rsi-slider" min="10" max="45" value="30">
                            </div>
                            <div class="cfg-field">
                                <label style="display:flex; justify-content:space-between;">
                                    <span>Порог Stoch:</span>
                                    <div class="val-badge-dual">
                                        <span class="badge-low" id="stoch-val-low">≤ 20</span>
                                        <span class="badge-high" id="stoch-val-high">≥ 80</span>
                                    </div>
                                </label>
                                <input type="range" id="stoch-slider" min="5" max="40" value="20">
                            </div>
                        </div>
                    </div>

                    <!-- БЛОК 3: КУЛЬМИНАЦИЯ ОБЪЕМА И ЛИКВИДНОСТЬ -->
                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Кульминация объема и ликвидность</span>
                            <button class="secondary-btn" id="reset-filters-btn" style="font-size:10px; padding:2px 6px;">Сбросить фильтры</button>
                        </div>
                        <div class="cfg-grid-2">
                            <div class="cfg-field">
                                <label>Порог кульминации (RVOL):</label>
                                <select id="climax-rvol-select">
                                    <option value="1.5">1.5x (Повышенный)</option>
                                    <option value="2.0">2.0x (Всплеск объема — Стандарт)</option>
                                    <option value="2.5">2.5x (Мощный всплеск)</option>
                                    <option value="3.0">3.0x (Аномальный объем)</option>
                                </select>
                            </div>
                            <div class="cfg-field">
                                <label>Мин. дневной оборот (Ликвидность):</label>
                                <select id="volume-filter-select">
                                    <option value="0">Любой оборот (включая 3 эшелон)</option>
                                    <option value="5000000">&gt; 5 млн ₽ в день</option>
                                    <option value="20000000">&gt; 20 млн ₽ в день (Рекомендуется)</option>
                                    <option value="100000000">&gt; 100 млн ₽ в день (Голубые фишки)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- МОДУЛЬ 2: Оповещения -->
                <div class="settings-tab-pane" id="tab-alerts">
                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Каналы оповещений на ПК</span>
                        </div>
                        <div class="cfg-card-row">
                            <button class="hdr-btn" id="sound-toggle-btn">Звук: ВЫКЛ</button>
                            <button class="hdr-btn" id="push-toggle-btn">Push: ВЫКЛ</button>
                            <button class="secondary-btn" id="test-sound-long-btn">Тест (Long)</button>
                            <button class="secondary-btn" id="test-sound-short-btn">Тест (Short)</button>
                            <button class="secondary-btn" id="test-push-btn">Тест Push</button>
                        </div>
                    </div>

                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Параметры сигналов и антиспам</span>
                        </div>
                        <div class="cfg-grid-2">
                            <div class="cfg-field">
                                <label>Озвучивать и отправлять:</label>
                                <select id="alert-direction-select">
                                    <option value="both">Лонги и Шорты (Оба)</option>
                                    <option value="long_only">Только Лонги</option>
                                    <option value="short_only">Только Шорты</option>
                                </select>
                            </div>
                            <div class="cfg-field">
                                <label>Период тишины (Cooldown):</label>
                                <div style="display:flex; gap:6px;">
                                    <select id="cooldown-select">
                                        <option value="5">5 минут</option>
                                        <option value="15">15 минут (Рекомендуется)</option>
                                        <option value="30">30 минут</option>
                                        <option value="60">1 час</option>
                                    </select>
                                    <button class="secondary-btn" id="reset-cooldown-btn" style="white-space:nowrap;">Сброс</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Telegram-уведомления</span>
                            <button class="hdr-btn" id="tg-toggle-btn">Telegram: ВЫКЛ</button>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                            <input type="text" id="tg-token-input" placeholder="Bot Token (e.g. 123456789:ABCdefGhIJKlmNo...)" style="width:100%;">
                            <input type="text" id="tg-chat-input" placeholder="Chat ID или @channel_name" style="width:100%;">
                            <div class="cfg-card-row">
                                <button class="action-btn" id="test-tg-btn">Проверить отправку</button>
                                <span id="tg-test-status" style="font-size: 11px; color: #787b86;"></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- МОДУЛЬ 3: Система & Списки -->
                <div class="settings-tab-pane" id="tab-system">
                    <div class="cfg-card" style="border-left: 3px solid #2962ff;">
                        <div class="cfg-card-title">
                            <span>Токен Т-Инвестиций (Только чтение)</span>
                            <span id="tinkoff-token-badge" class="badge-nodata" style="font-size:10px;">Не задан</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
                            <input type="password" id="tinkoff-token-input" placeholder="t.xxxxxxxxxxxxxxxxxxxxxxxx..." style="width:100%;">
                            <div class="cfg-card-row">
                                <button class="action-btn" id="save-tinkoff-token-btn">Сохранить токен</button>
                                <span id="tinkoff-status-text" style="font-size: 11px; color: #787b86;"></span>
                            </div>
                        </div>
                    </div>

                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Параметры работы</span>
                        </div>
                        <div class="cfg-grid-2">
                            <div class="cfg-field">
                                <label>Частота опроса сканера:</label>
                                <select id="interval-select">
                                    <option value="10000">10 секунд</option>
                                    <option value="15000">15 секунд (Оптимально)</option>
                                    <option value="30000">30 секунд</option>
                                </select>
                            </div>
                            <div class="cfg-field">
                                <label>Клик по тикеру:</label>
                                <select id="open-mode-select">
                                    <option value="terminal">В терминале (активный график)</option>
                                    <option value="new_tab">Новая вкладка (tbank.ru)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="cfg-card">
                        <div class="cfg-card-title">
                            <span>Список избранных акций</span>
                            <span id="wl-count-label" style="color:#2962ff; font-size:11px;">Выбрано: 0</span>
                        </div>
                        <div style="display: flex; gap: 6px; margin-top: 6px;">
                            <input type="text" id="wl-input-add" placeholder="Тикеры через запятую или пробел (SBER, GAZP)..." style="flex:1;">
                            <button class="action-btn" id="wl-btn-add" style="white-space:nowrap;">Добавить</button>
                        </div>
                        <div class="cfg-card-row" style="margin-top: 6px;">
                            <button class="secondary-btn" id="wl-select-bluechips">Топ-15 фишек</button>
                            <button class="secondary-btn" id="wl-clear-all">Очистить всё</button>
                        </div>
                        <div class="wl-chips-container" id="wl-chips-container"></div>
                    </div>
                </div>
            </div>

            <!-- Панель фильтров над таблицей -->
            <div class="filter-toolbar" id="filter-toolbar">
                <!-- Фильтр списков акций -->
                <div class="list-dropdown-wrapper" id="list-dropdown-wrapper">
                    <button class="hdr-list-btn" id="list-select-btn" title="Выбор активного списка акций">
                        <span id="list-btn-label">Все акции</span>
                        <span class="dropdown-caret">▾</span>
                    </button>
                    <div class="list-dropdown-menu" id="list-dropdown-menu">
                        <div class="list-menu-item active" data-list="all_stocks">
                            <span class="menu-text">Все акции</span>
                            <span class="menu-check">✓</span>
                        </div>
                        <div class="list-menu-item" data-list="watched_only">
                            <span class="menu-text">Избранное</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-list="blue_chips">
                            <span class="menu-text">Голубые фишки</span>
                            <span class="menu-check"></span>
                        </div>
                    </div>
                </div>

                <!-- 1. Фильтр направления (Тип) -->
                <div class="list-dropdown-wrapper" id="dir-dropdown-wrapper">
                    <button class="hdr-list-btn" id="dir-select-btn" title="Фильтр направления (Тип сигнала)">
                        <span id="dir-btn-label">Все бумаги</span>
                        <span class="dropdown-caret">▾</span>
                    </button>
                    <div class="list-dropdown-menu" id="dir-dropdown-menu">
                        <div class="list-menu-item active" data-dir="all">
                            <span class="menu-text">Все бумаги</span>
                            <span class="menu-check">✓</span>
                        </div>
                        <div class="list-menu-item" data-dir="signals">
                            <span class="menu-text">Лонг + Шорт</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-dir="long">
                            <span class="menu-text">Только Лонг</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-dir="short">
                            <span class="menu-text">Только Шорт</span>
                            <span class="menu-check"></span>
                        </div>
                    </div>
                </div>

                <!-- 2. Фильтр индикаторов (Триггер) -->
                <div class="list-dropdown-wrapper" id="ind-dropdown-wrapper">
                    <button class="hdr-list-btn" id="ind-select-btn" title="Условие триггера индикаторов">
                        <span id="ind-btn-label">RSI + Stoch</span>
                        <span class="dropdown-caret">▾</span>
                    </button>
                    <div class="list-dropdown-menu" id="ind-dropdown-menu">
                        <div class="list-menu-item active" data-ind="both">
                            <span class="menu-text">RSI + Stoch</span>
                            <span class="menu-check">✓</span>
                        </div>
                        <div class="list-menu-item" data-ind="any">
                            <span class="menu-text">RSI или Stoch</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-ind="rsi_only">
                            <span class="menu-text">Только RSI</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-ind="stoch_only">
                            <span class="menu-text">Только Stoch</span>
                            <span class="menu-check"></span>
                        </div>
                    </div>
                </div>

                <!-- 3. Фильтр объемов (RVOL) -->
                <div class="list-dropdown-wrapper" id="rvol-dropdown-wrapper">
                    <button class="hdr-list-btn" id="rvol-select-btn" title="Фильтр относительного объема (RVOL)">
                        <span id="rvol-btn-label">Все объемы</span>
                        <span class="dropdown-caret">▾</span>
                    </button>
                    <div class="list-dropdown-menu" id="rvol-dropdown-menu">
                        <div class="list-menu-item active" data-rvol="0">
                            <span class="menu-text">Все объемы</span>
                            <span class="menu-check">✓</span>
                        </div>
                        <div class="list-menu-item" data-rvol="1.5">
                            <span class="menu-text">≥ 1.5x</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-rvol="2.0">
                            <span class="menu-text">≥ 2.0x</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-rvol="3.0">
                            <span class="menu-text">≥ 3.0x</span>
                            <span class="menu-check"></span>
                        </div>
                    </div>
                </div>

                <!-- Фильтр таймфрейма подтверждения сигнала -->
                <div class="list-dropdown-wrapper" id="tf-dropdown-wrapper">
                    <button class="hdr-list-btn" id="tf-select-btn" title="Таймфрейм подтверждения сигнала">
                        <span id="tf-btn-label">Все ТФ</span>
                        <span class="dropdown-caret">▾</span>
                    </button>
                    <div class="list-dropdown-menu" id="tf-dropdown-menu">
                        <div class="list-menu-item active" data-tf="any">
                            <span class="menu-text">Все ТФ</span>
                            <span class="menu-check">✓</span>
                        </div>
                        <div class="list-menu-item" data-tf="5m">
                            <span class="menu-text">5m</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-tf="15m">
                            <span class="menu-text">15m</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-tf="1h">
                            <span class="menu-text">1h</span>
                            <span class="menu-check"></span>
                        </div>
                        <div class="list-menu-item" data-tf="4h">
                            <span class="menu-text">4h</span>
                            <span class="menu-check"></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Бесшовная таблица на всю высоту сразу под панелью фильтров -->
            <div class="table-container" id="table-container">
                <table>
                    <thead>
                        <tr>
                            <th data-sort="ticker" style="text-align:left;">★ Тикер <span class="sort-arrow" id="arr-ticker"></span></th>
                            <th data-sort="change">Цена / Изм <span class="sort-arrow" id="arr-change"></span></th>
                            <th data-sort="rvol" title="Относительный объем к средней норме дней (RVOL)">RVOL <span class="sort-arrow" id="arr-rvol"></span></th>
                            <th data-sort="5m" title="5 минут (RSI | Stoch %K)">5 мин <span class="sort-arrow" id="arr-5m"></span></th>
                            <th data-sort="15m" title="15 минут (RSI | Stoch %K)">15 мин <span class="sort-arrow" id="arr-15m"></span></th>
                            <th data-sort="1h" title="1 час (RSI | Stoch %K)">1 час <span class="sort-arrow" id="arr-1h"></span></th>
                            <th data-sort="4h" title="4 часа (RSI | Stoch %K)">4 часа <span class="sort-arrow" id="arr-4h"></span></th>
                            <th data-sort="status">Статус <span class="sort-arrow" id="arr-status"></span></th>
                        </tr>
                    </thead>
                    <tbody id="stocks-tbody">
                        <tr><td colspan="8" style="padding: 20px; text-align: center; color: #787b86;">Загрузка котировок Мосбиржи...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Нижняя панель: статус и обновление слева, ротация ТФ справа -->
            <div id="footer-bar">
                <div class="footer-left">
                    <div class="live-indicator" id="status-text" title="Статус данных MOEX">
                        <span class="live-dot dot-yellow"></span>
                        <span>Подключение к сканеру...</span>
                    </div>
                    <button class="footer-refresh-btn" id="refresh-btn" title="Обновить котировки Т-Инвестиций">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="14" height="14" fill="none"><path fill="currentColor" d="m9.75 16.072-.52.856-3.178-1.932a8.002 8.002 0 0 0 14.804 3.112l.865.503A9 9 0 0 1 13.99 23a9 9 0 0 1-8.887-7.57L3.42 18.257l-.86-.512 2.642-4.433zM14 5a9 9 0 0 1 8.888 7.57l1.683-2.826.859.512-2.642 4.434-4.547-2.762.519-.856 3.18 1.932A8.003 8.003 0 0 0 7.134 9.892l-.864-.503A9 9 0 0 1 14 5"></path></svg>
                    </button>
                </div>
                <div class="footer-right">
                    <div id="footer-text" title="Кликните для переключения таймфрейма">
                        <span class="footer-badge-tf">5m:</span>
                        <span class="footer-lbl">RSI+STH</span> <span class="footer-val-long">0</span><span class="footer-sep">|</span><span class="footer-val-short">0</span>
                        <span class="footer-dot">•</span>
                        <span class="footer-lbl">RSI</span> <span class="footer-val-long">0</span><span class="footer-sep">|</span><span class="footer-val-short">0</span>
                        <span class="footer-dot">•</span>
                        <span class="footer-lbl">STH</span> <span class="footer-val-long">0</span><span class="footer-sep">|</span><span class="footer-val-short">0</span>
                    </div>
                    <div class="resize-handle" id="resize-handle" title="Потяните для изменения размера окна">
                        <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
                            <path d="M8 2L2 8M9 5L5 9M9 8L8 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    `;
    shadow.appendChild(container);

    // Ссылки на элементы UI
    const rsiSlider = shadow.getElementById('rsi-slider');
    const stochSlider = shadow.getElementById('stoch-slider');
    const rsiValLow = shadow.getElementById('rsi-val-low');
    const rsiValHigh = shadow.getElementById('rsi-val-high');
    const stochValLow = shadow.getElementById('stoch-val-low');
    const stochValHigh = shadow.getElementById('stoch-val-high');

    // Ссылки на параметры и периоды индикаторов
    const rsiPeriodSlider = shadow.getElementById('rsi-period-slider');
    const stochPeriodSlider = shadow.getElementById('stoch-period-slider');
    const rvolDaysSlider = shadow.getElementById('rvol-days-slider');
    const rsiPeriodBadge = shadow.getElementById('rsi-period-badge');
    const stochPeriodBadge = shadow.getElementById('stoch-period-badge');
    const rvolDaysBadge = shadow.getElementById('rvol-days-badge');

    // Фильтры
    const modeSelect = shadow.getElementById('mode-select');
    const tfSelect = shadow.getElementById('tf-select');
    const volumeFilterSelect = shadow.getElementById('volume-filter-select');
    const resetFiltersBtn = shadow.getElementById('reset-filters-btn');

    // Статус и футер
    const statusText = shadow.getElementById('status-text');
    const footerBar = shadow.getElementById('footer-bar');
    const footerText = shadow.getElementById('footer-text');
    const tbody = shadow.getElementById('stocks-tbody');
    const tableContainer = shadow.getElementById('table-container');
    const filterToolbar = shadow.getElementById('filter-toolbar');
    const closeWidgetBtn = shadow.getElementById('close-widget-btn');
    const headerEl = shadow.getElementById('header');
    const resizeHandle = shadow.getElementById('resize-handle');
    const widget = shadow.getElementById('widget');

    // ==========================================
    // ЭТАП 1: ЕДИНЫЙ CONFIG STORE & АВТО-МИГРАЦИЯ
    // ==========================================
    const DEFAULT_CONFIG = {
        version: 12,
        ui: {
            width: 720,
            height: 520,
            x: null,
            y: null,
            visible: true
        },
        filters: {
            listFilter: 'all_stocks',
            direction: 'all',
            indicatorMode: 'both',
            minRvolFilter: 0,
            tf: 'any',
            minVolumeRub: 0,
            sortField: 'change',
            sortAsc: false
        },
        thresholds: {
            rsi: 30,
            stoch: 20,
            climaxRvol: 2.0
        },
        indicators: {
            rsiPeriod: 14,
            stochPeriod: 14,
            rvolDays: 10
        },
        alerts: {
            sound: false,
            push: false,
            telegram: false,
            tgToken: '',
            tgChatId: '',
            cooldownMins: 15,
            direction: 'both'
        },
        favorites: ["SBER", "GAZP", "LKOH", "ROSN", "NVTK", "YDEX", "T", "SIBN", "GMKN", "TATN"],
        network: {
            refreshIntervalMs: 15000,
            openInNewTab: false,
            chartTargetGroup: 'auto',
            tinkoffToken: '',
            isPaused: false
        }
    };

    function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        const result = Array.isArray(target) ? [...target] : { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    const ConfigStore = {
        data: null,

        init() {
            let saved = null;
            try {
                saved = GM_getValue('moex_config_v11', null);
            } catch (e) {
                saved = null;
            }

            if (!saved || typeof saved !== 'object' || !saved.version || saved.version < 11) {
                saved = this.migrateLegacy();
            }

            this.data = deepMerge(DEFAULT_CONFIG, saved);

            // Миграция старого filters.mode на раздельные direction и indicatorMode
            if (this.data && this.data.filters) {
                if (this.data.filters.mode && (!this.data.filters.direction || this.data.filters.direction === 'all')) {
                    if (this.data.filters.mode === 'signal_long') this.data.filters.direction = 'long';
                    else if (this.data.filters.mode === 'signal_short') this.data.filters.direction = 'short';
                    else if (this.data.filters.mode === 'signal_both') this.data.filters.direction = 'signals';
                    else if (this.data.filters.mode === 'signal_any') {
                        this.data.filters.direction = 'signals';
                        this.data.filters.indicatorMode = 'any';
                    } else if (this.data.filters.mode === 'signal_climax') {
                        this.data.filters.direction = 'signals';
                        this.data.filters.minRvolFilter = 3.0;
                    }
                }
            }

            this.save();
            return this.data;
        },

        migrateLegacy() {
            const migrated = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

            const oldWl = GM_getValue('moex_watched_tickers', null);
            if (oldWl !== null) {
                try {
                    migrated.favorites = Array.isArray(oldWl) ? oldWl : Array.from(oldWl);
                } catch (e) {}
            }

            const legacyMap = {
                'moex_watch_filter': (v) => migrated.filters.listFilter = String(v),
                'moex_sound_on': (v) => migrated.alerts.sound = !!v,
                'moex_push_on': (v) => migrated.alerts.push = !!v,
                'moex_tg_on': (v) => migrated.alerts.telegram = !!v,
                'moex_tg_token': (v) => migrated.alerts.tgToken = String(v),
                'moex_tg_chat_id': (v) => migrated.alerts.tgChatId = String(v),
                'moex_cooldown_mins': (v) => migrated.alerts.cooldownMins = parseInt(v, 10) || 15,
                'moex_alert_dir': (v) => migrated.alerts.direction = String(v),
                'moex_climax_rvol': (v) => migrated.thresholds.climaxRvol = parseFloat(v) || 2.0,
                'moex_open_new_tab': (v) => migrated.network.openInNewTab = (v === 'new_tab'),
                'moex_min_vol_rub': (v) => migrated.filters.minVolumeRub = parseFloat(v) || 0,
                'moex_min_rvol_filter': (v) => migrated.filters.minRvolFilter = parseFloat(v) || 0,
                'moex_sort_field': (v) => migrated.filters.sortField = String(v),
                'moex_sort_asc': (v) => migrated.filters.sortAsc = !!v,
                'moex_sym_rsi': (v) => migrated.thresholds.rsi = parseFloat(v) || 30,
                'moex_sym_stoch': (v) => migrated.thresholds.stoch = parseFloat(v) || 20,
                'moex_all_mode': (v) => migrated.filters.mode = String(v),
                'moex_all_tf': (v) => migrated.filters.tf = String(v),
                'moex_refresh_ms': (v) => migrated.network.refreshIntervalMs = parseInt(v, 10) || 15000,
                'moex_widget_w': (v) => migrated.ui.width = parseInt(v, 10) || 720,
                'moex_widget_h': (v) => migrated.ui.height = parseInt(v, 10) || 520,
                'moex_widget_x': (v) => migrated.ui.x = (v !== null ? parseInt(v, 10) : null),
                'moex_widget_y': (v) => migrated.ui.y = (v !== null ? parseInt(v, 10) : null)
            };

            for (const [k, setter] of Object.entries(legacyMap)) {
                const val = GM_getValue(k, null);
                if (val !== null) {
                    try { setter(val); } catch (e) {}
                    if (typeof GM_deleteValue === 'function') {
                        try { GM_deleteValue(k); } catch (e) {}
                    }
                }
            }

            if (typeof GM_deleteValue === 'function') {
                try { GM_deleteValue('moex_watched_tickers'); } catch (e) {}
            }

            // Миграция старого filters.mode на раздельные direction и indicatorMode
            if (migrated.filters) {
                if (!migrated.filters.direction) {
                    if (migrated.filters.mode === 'signal_long') migrated.filters.direction = 'long';
                    else if (migrated.filters.mode === 'signal_short') migrated.filters.direction = 'short';
                    else if (migrated.filters.mode === 'signal_both' || migrated.filters.mode === 'signal_any') migrated.filters.direction = 'signals';
                    else if (migrated.filters.mode === 'signal_climax') {
                        migrated.filters.direction = 'signals';
                        migrated.filters.minRvolFilter = 3.0;
                    } else {
                        migrated.filters.direction = 'all';
                    }
                }
                if (!migrated.filters.indicatorMode) {
                    if (migrated.filters.mode === 'signal_any') migrated.filters.indicatorMode = 'any';
                    else migrated.filters.indicatorMode = 'both';
                }
            }

            migrated.version = 11;
            return migrated;
        },

        save() {
            try {
                GM_setValue('moex_config_v11', this.data);
            } catch (e) {
                console.error('[MOEX Screener] Ошибка сохранения настроек:', e);
            }
        }
    };

    // Загрузка конфигурации
    ConfigStore.init();
    const config = ConfigStore.data;

    // Кнопки в шапке
    const listSelectBtn = shadow.getElementById('list-select-btn');
    const listBtnLabel = shadow.getElementById('list-btn-label');
    const listDropdownMenu = shadow.getElementById('list-dropdown-menu');
    let currentListFilter = config.filters.listFilter || 'all_stocks';

    const LIST_LABELS = {
        'all_stocks': 'Все акции',
        'watched_only': 'Избранное',
        'blue_chips': 'Голубые фишки'
    };
    const TOP_BLUE_CHIPS = new Set(FALLBACK_BLUE_CHIPS.slice(0, 15));

    // 1. Фильтр направления (Тип)
    const dirSelectBtn = shadow.getElementById('dir-select-btn');
    const dirBtnLabel = shadow.getElementById('dir-btn-label');
    const dirDropdownMenu = shadow.getElementById('dir-dropdown-menu');
    let currentDirectionFilter = config.filters.direction || 'all';

    const DIR_LABELS = {
        'all': 'Все бумаги',
        'signals': 'Лонг + Шорт',
        'long': 'Только Лонг',
        'short': 'Только Шорт'
    };

    // 2. Фильтр индикаторов (Триггер)
    const indSelectBtn = shadow.getElementById('ind-select-btn');
    const indBtnLabel = shadow.getElementById('ind-btn-label');
    const indDropdownMenu = shadow.getElementById('ind-dropdown-menu');
    let currentIndicatorFilter = config.filters.indicatorMode || 'both';

    const IND_LABELS = {
        'both': 'RSI + Stoch',
        'any': 'RSI или Stoch',
        'rsi_only': 'Только RSI',
        'stoch_only': 'Только Stoch'
    };

    // 3. Фильтр объемов (RVOL)
    const rvolSelectBtn = shadow.getElementById('rvol-select-btn');
    const rvolBtnLabel = shadow.getElementById('rvol-btn-label');
    const rvolDropdownMenu = shadow.getElementById('rvol-dropdown-menu');

    const RVOL_LABELS = {
        '0': 'Все объемы',
        '1.5': '≥ 1.5x',
        '2.0': '≥ 2.0x',
        '3.0': '≥ 3.0x'
    };

    const tfSelectBtn = shadow.getElementById('tf-select-btn');
    const tfBtnLabel = shadow.getElementById('tf-btn-label');
    const tfDropdownMenu = shadow.getElementById('tf-dropdown-menu');
    let currentTfFilter = config.filters.tf || 'any';

    const TF_FILTER_LABELS = {
        'any': 'Все ТФ',
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h'
    };

    // Цвета и названия 4 групп Т-Банк Терминала + Авто
    const GROUPS_COLORS = {
        'auto': '#2979ff',
        'group1': 'rgb(255, 212, 80)',  // 🟡 Желтый
        'group2': 'rgb(255, 123, 118)', // 🔴 Красный
        'group3': 'rgb(163, 129, 255)', // 🟣 Фиолетовый
        'group4': 'rgb(77, 195, 247)'   // 🔵 Голубой
    };

    const GROUPS_LABELS = {
        'auto': 'Авто',
        'group1': 'Группа 1',
        'group2': 'Группа 2',
        'group3': 'Группа 3',
        'group4': 'Группа 4'
    };

    const groupSelectBtn = shadow.getElementById('group-select-btn');
    const groupDropdownMenu = shadow.getElementById('group-dropdown-menu');
    const headerGroupDot = shadow.getElementById('header-group-dot');
    let currentChartGroup = (config.network && config.network.chartTargetGroup) || 'auto';

    const searchBtn = shadow.getElementById('search-btn');
    const searchInputContainer = shadow.getElementById('search-input-container');
    const headerSearchInput = shadow.getElementById('header-search-input');
    const searchClearBtn = shadow.getElementById('search-clear-btn');
    let searchQuery = '';
    const refreshBtn = shadow.getElementById('refresh-btn');
    const settingsBtn = shadow.getElementById('settings-btn');
    const closeSettingsBtn = shadow.getElementById('close-settings-btn');
    const settingsPanel = shadow.getElementById('settings-panel');

    // Тумблеры внутри настроек
    const soundToggleBtn = shadow.getElementById('sound-toggle-btn');
    const pushToggleBtn = shadow.getElementById('push-toggle-btn');
    const tgToggleBtn = shadow.getElementById('tg-toggle-btn');

    // Вкладки настроек
    const tabBtns = shadow.querySelectorAll('.settings-tab-btn');
    const tabPanes = shadow.querySelectorAll('.settings-tab-pane');

    // Элементы настроек
    const wlCountLabel = shadow.getElementById('wl-count-label');
    const wlInputAdd = shadow.getElementById('wl-input-add');
    const wlBtnAdd = shadow.getElementById('wl-btn-add');
    const wlSelectBluechips = shadow.getElementById('wl-select-bluechips');
    const wlClearAll = shadow.getElementById('wl-clear-all');
    const wlChipsContainer = shadow.getElementById('wl-chips-container');
    const alertDirectionSelect = shadow.getElementById('alert-direction-select');
    const climaxRvolSelect = shadow.getElementById('climax-rvol-select');
    const intervalSelect = shadow.getElementById('interval-select');
    const cooldownSelect = shadow.getElementById('cooldown-select');
    const openModeSelect = shadow.getElementById('open-mode-select');
    const resetCooldownBtn = shadow.getElementById('reset-cooldown-btn');
    const testSoundLongBtn = shadow.getElementById('test-sound-long-btn');
    const testSoundShortBtn = shadow.getElementById('test-sound-short-btn');
    const testPushBtn = shadow.getElementById('test-push-btn');
    const tgTokenInput = shadow.getElementById('tg-token-input');
    const tgChatInput = shadow.getElementById('tg-chat-input');
    const testTgBtn = shadow.getElementById('test-tg-btn');
    const tgTestStatus = shadow.getElementById('tg-test-status');
    const tinkoffTokenInput = shadow.getElementById('tinkoff-token-input');
    const saveTinkoffTokenBtn = shadow.getElementById('save-tinkoff-token-btn');
    const tinkoffTokenBadge = shadow.getElementById('tinkoff-token-badge');
    const tinkoffStatusText = shadow.getElementById('tinkoff-status-text');

    // Состояние приложения (привязано к ConfigStore)
    let tinkoffToken = (config.network && config.network.tinkoffToken) || '';
    let isPaused = !!(config.network && config.network.isPaused);
    let lastUpdateTime = '';
    let allStocks = [];
    let watchedTickers = new Set(config.favorites || []);
    let soundEnabled = !!config.alerts.sound;
    let pushEnabled = !!config.alerts.push;
    let tgEnabled = !!config.alerts.telegram;
    let tgToken = config.alerts.tgToken || '';
    let tgChatId = config.alerts.tgChatId || '';
    let cooldownMinutes = config.alerts.cooldownMins || 15;
    let alertDirection = config.alerts.direction || 'both';
    let climaxRvolThreshold = config.thresholds.climaxRvol || 2.0;

    let openInNewTab = !!config.network.openInNewTab;
    let minVolumeRub = config.filters.minVolumeRub || 0;
    let minRvolFilter = config.filters.minRvolFilter || 0;
    let sortField = config.filters.sortField || 'change';
    let sortAsc = !!config.filters.sortAsc;
    let timerId = null;

    // Персистентная история алертов (Cooldown)
    let lastAlertTimes = {};
    try {
        lastAlertTimes = JSON.parse(GM_getValue('moex_alert_times', '{}'));
    } catch (e) {
        lastAlertTimes = {};
    }

    function saveAlertTimesToStorage() {
        const now = Date.now();
        const cutoff = now - (cooldownMinutes * 2 * 60 * 1000);
        for (const k in lastAlertTimes) {
            if (lastAlertTimes[k] < cutoff) delete lastAlertTimes[k];
        }
        GM_setValue('moex_alert_times', JSON.stringify(lastAlertTimes));
    }

    // Переключение вкладок настроек
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.toggle('active', b === btn));
            tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === targetId));
            if (targetId === 'tab-system') renderWatchlistUI();
        });
    });

    // Инициализация сохраненных порогов и периодов индикаторов
    if (!config.indicators) {
        config.indicators = { rsiPeriod: 14, stochPeriod: 14, rvolDays: 10 };
    }

    rsiSlider.value = String(config.thresholds.rsi || 30);
    stochSlider.value = String(config.thresholds.stoch || 20);
    if (rsiPeriodSlider) rsiPeriodSlider.value = String(config.indicators.rsiPeriod || 14);
    if (stochPeriodSlider) stochPeriodSlider.value = String(config.indicators.stochPeriod || 14);
    if (rvolDaysSlider) rvolDaysSlider.value = String(config.indicators.rvolDays || 10);

    function updateSliderLabels() {
        const rVal = parseInt(rsiSlider.value, 10);
        const sVal = parseInt(stochSlider.value, 10);
        rsiValLow.textContent = `≤ ${rVal}`;
        rsiValHigh.textContent = `≥ ${100 - rVal}`;
        stochValLow.textContent = `≤ ${sVal}`;
        stochValHigh.textContent = `≥ ${100 - sVal}`;

        if (rsiPeriodBadge && rsiPeriodSlider) {
            rsiPeriodBadge.textContent = rsiPeriodSlider.value;
        }
        if (stochPeriodBadge && stochPeriodSlider) {
            stochPeriodBadge.textContent = stochPeriodSlider.value;
        }
        if (rvolDaysBadge && rvolDaysSlider) {
            rvolDaysBadge.textContent = `${rvolDaysSlider.value} дн`;
        }
    }
    updateSliderLabels();

    // Инициализация значений фильтров
    function updateListFilterUI(filterKey, saveToStore = true) {
        currentListFilter = filterKey;
        if (saveToStore) {
            config.filters.listFilter = filterKey;
            ConfigStore.save();
        }
        if (listBtnLabel) listBtnLabel.textContent = LIST_LABELS[filterKey] || 'Все акции';

        if (listDropdownMenu) {
            listDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
                const isMatch = item.getAttribute('data-list') === filterKey;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
    }
    updateListFilterUI(currentListFilter, false);

    function updateDirectionFilterUI(dirKey, saveToStore = true) {
        currentDirectionFilter = dirKey || 'all';
        if (saveToStore) {
            config.filters.direction = currentDirectionFilter;
            ConfigStore.save();
        }
        if (dirBtnLabel) dirBtnLabel.textContent = DIR_LABELS[currentDirectionFilter] || 'Все бумаги';
        if (dirSelectBtn) {
            dirSelectBtn.classList.toggle('active-filter', currentDirectionFilter !== 'all');
        }
        if (dirDropdownMenu) {
            dirDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
                const isMatch = item.getAttribute('data-dir') === currentDirectionFilter;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
    }
    updateDirectionFilterUI(currentDirectionFilter, false);

    function updateIndicatorFilterUI(indKey, saveToStore = true) {
        currentIndicatorFilter = indKey || 'both';
        if (saveToStore) {
            config.filters.indicatorMode = currentIndicatorFilter;
            ConfigStore.save();
        }
        if (indBtnLabel) indBtnLabel.textContent = IND_LABELS[currentIndicatorFilter] || 'RSI + Stoch';
        if (indSelectBtn) {
            indSelectBtn.classList.toggle('active-filter', currentIndicatorFilter !== 'both');
        }
        if (indDropdownMenu) {
            indDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
                const isMatch = item.getAttribute('data-ind') === currentIndicatorFilter;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
    }
    updateIndicatorFilterUI(currentIndicatorFilter, false);

    function updateRvolFilterUI(rvolVal, saveToStore = true) {
        minRvolFilter = parseFloat(rvolVal) || 0;
        if (saveToStore) {
            config.filters.minRvolFilter = minRvolFilter;
            ConfigStore.save();
        }
        const key = String(minRvolFilter);
        if (rvolBtnLabel) rvolBtnLabel.textContent = RVOL_LABELS[key] || (minRvolFilter > 0 ? `≥ ${minRvolFilter}x` : 'Все объемы');
        if (rvolSelectBtn) {
            rvolSelectBtn.classList.toggle('active-filter', minRvolFilter > 0);
        }
        if (rvolDropdownMenu) {
            rvolDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
                const isMatch = parseFloat(item.getAttribute('data-rvol')) === minRvolFilter;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
    }
    updateRvolFilterUI(minRvolFilter, false);

    function updateTfFilterUI(tfKey, saveToStore = true) {
        currentTfFilter = tfKey || 'any';
        if (saveToStore) {
            config.filters.tf = currentTfFilter;
            ConfigStore.save();
        }
        if (tfBtnLabel) tfBtnLabel.textContent = TF_FILTER_LABELS[currentTfFilter] || 'Все ТФ';
        if (tfSelectBtn) {
            tfSelectBtn.classList.toggle('active-filter', currentTfFilter !== 'any');
        }
        if (tfDropdownMenu) {
            tfDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
                const isMatch = item.getAttribute('data-tf') === currentTfFilter;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
        if (tfSelect) tfSelect.value = currentTfFilter;
    }
    updateTfFilterUI(currentTfFilter, false);

    function updateGroupUI(groupKey, saveToStore = true) {
        currentChartGroup = groupKey || 'auto';
        if (saveToStore) {
            config.network.chartTargetGroup = currentChartGroup;
            ConfigStore.save();
        }
        if (headerGroupDot) {
            headerGroupDot.style.backgroundColor = GROUPS_COLORS[currentChartGroup] || '#2979ff';
        }
        if (groupSelectBtn) {
            groupSelectBtn.title = `Группа графика: ${GROUPS_LABELS[currentChartGroup] || 'Авто'} (клик для выбора)`;
        }
        if (groupDropdownMenu) {
            groupDropdownMenu.querySelectorAll('.group-menu-item').forEach(item => {
                const isMatch = item.getAttribute('data-group') === currentChartGroup;
                item.classList.toggle('active', isMatch);
                const checkEl = item.querySelector('.group-menu-check');
                if (checkEl) checkEl.textContent = isMatch ? '✓' : '';
            });
        }
    }
    updateGroupUI(currentChartGroup, false);

    if (modeSelect) modeSelect.value = config.filters.mode || 'all';
    if (tfSelect) tfSelect.value = config.filters.tf || 'any';
    if (volumeFilterSelect) volumeFilterSelect.value = String(minVolumeRub);

    intervalSelect.value = String(config.network.refreshIntervalMs || 15000);
    climaxRvolSelect.value = String(climaxRvolThreshold);
    cooldownSelect.value = String(cooldownMinutes);
    alertDirectionSelect.value = alertDirection;
    openModeSelect.value = openInNewTab ? 'new_tab' : 'terminal';
    tgTokenInput.value = tgToken;
    tgChatInput.value = tgChatId;

    resetFiltersBtn.addEventListener('click', () => {
        updateListFilterUI('all_stocks');
        updateDirectionFilterUI('all');
        updateIndicatorFilterUI('both');
        updateRvolFilterUI(0);
        updateTfFilterUI('any');
        if (tfSelect) tfSelect.value = 'any';
        if (volumeFilterSelect) volumeFilterSelect.value = '0';

        minVolumeRub = 0;
        config.filters.minVolumeRub = 0;
        ConfigStore.save();

        renderTable();
        renderFooterBar();
    });

    function updateToggleButtonsUI() {
        soundToggleBtn.textContent = soundEnabled ? 'Звук: ВКЛ' : 'Звук: ВЫКЛ';
        soundToggleBtn.classList.toggle('active-on', soundEnabled);

        pushToggleBtn.textContent = pushEnabled ? 'Push: ВКЛ' : 'Push: ВЫКЛ';
        pushToggleBtn.classList.toggle('active-on', pushEnabled);

        tgToggleBtn.textContent = tgEnabled ? 'TG: ВКЛ' : 'TG: ВЫКЛ';
        tgToggleBtn.classList.toggle('active-on', tgEnabled);
    }
    updateToggleButtonsUI();

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        config.alerts.sound = soundEnabled;
        ConfigStore.save();
        updateToggleButtonsUI();
        if (soundEnabled) playAlertSound('long', false);
    });

    pushToggleBtn.addEventListener('click', () => {
        pushEnabled = !pushEnabled;
        config.alerts.push = pushEnabled;
        ConfigStore.save();
        updateToggleButtonsUI();
        if (pushEnabled) {
            if ('Notification' in window && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
            sendSystemPushNotification('MOEX Live Screener', `Push-уведомления активны (Cooldown ${cooldownMinutes} мин).`);
        }
    });

    tgToggleBtn.addEventListener('click', () => {
        tgEnabled = !tgEnabled;
        config.alerts.telegram = tgEnabled;
        ConfigStore.save();
        updateToggleButtonsUI();
        if (tgEnabled && (!tgToken || !tgChatId)) {
            statusText.innerHTML = '<span class="live-dot dot-yellow"></span> <span>Укажите Bot Token в TG!</span>';
        }
    });

    // Web Audio Синтезатор
    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (AudioCtxClass) audioCtx = new AudioCtxClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }
    document.addEventListener('pointerdown', () => { getAudioContext(); }, { once: true });

    function playAlertSound(dir = 'long', isClimax = false) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = isClimax ? 'sawtooth' : 'sine';
            osc2.type = 'triangle';

            if (dir === 'long') {
                osc1.frequency.setValueAtTime(587.33, now);
                osc1.frequency.setValueAtTime(880, now + 0.14);
                if (isClimax) osc1.frequency.setValueAtTime(1174.66, now + 0.28);
                osc2.frequency.setValueAtTime(293.66, now);
                osc2.frequency.setValueAtTime(440, now + 0.14);
            } else {
                osc1.frequency.setValueAtTime(880, now);
                osc1.frequency.setValueAtTime(587.33, now + 0.14);
                if (isClimax) osc1.frequency.setValueAtTime(440, now + 0.28);
                osc2.frequency.setValueAtTime(440, now);
                osc2.frequency.setValueAtTime(293.66, now + 0.14);
            }

            const dur = isClimax ? 0.65 : 0.48;
            gain.gain.setValueAtTime(isClimax ? 0.25 : 0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + dur);
            osc2.stop(now + dur);
        } catch (e) {}
    }

    function sendSystemPushNotification(title, message) {
        try {
            if (typeof GM_notification === 'function') {
                GM_notification({
                    title: title,
                    text: message,
                    timeout: 9000,
                    onclick: () => { window.focus(); }
                });
                return;
            }
        } catch (e) {}

        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, { body: message, silent: false });
            n.onclick = () => { window.focus(); };
        }
    }

    function sendTelegramAlert(textHtml, onComplete) {
        if (!tgToken || !tgChatId) {
            if (onComplete) onComplete(false, 'Токен или Chat ID не заполнены');
            return;
        }
        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://api.telegram.org/bot${encodeURIComponent(tgToken)}/sendMessage`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                chat_id: tgChatId,
                text: textHtml,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }),
            timeout: 7000,
            onload: function(res) {
                if (res.status === 200) {
                    if (onComplete) onComplete(true, 'Успешно отправлено!');
                } else {
                    if (onComplete) onComplete(false, `Ошибка HTTP ${res.status}`);
                }
            },
            onerror: function() {
                if (onComplete) onComplete(false, 'Ошибка сети Telegram API');
            }
        });
    }

    testSoundLongBtn.addEventListener('click', () => playAlertSound('long', true));
    testSoundShortBtn.addEventListener('click', () => playAlertSound('short', true));
    testPushBtn.addEventListener('click', () => {
        sendSystemPushNotification('Тест Push • MOEX Live', '🟢 Лонги и 🔴 Шорты мониторятся одновременно!');
    });
    testTgBtn.addEventListener('click', () => {
        saveTgSettings();
        tgTestStatus.textContent = 'Отправка...';
        tgTestStatus.style.color = '#ffb74d';
        sendTelegramAlert('🔔 <b>Тест бота MOEX Screener Pro</b>\nСвязь установлена успешно!', (ok, msg) => {
            tgTestStatus.textContent = ok ? '✅ ' + msg : '❌ ' + msg;
            tgTestStatus.style.color = ok ? '#00e676' : '#f23645';
        });
    });

    function saveTgSettings() {
        tgToken = tgTokenInput.value.trim();
        tgChatId = tgChatInput.value.trim();
        config.alerts.tgToken = tgToken;
        config.alerts.tgChatId = tgChatId;
        ConfigStore.save();
    }
    tgTokenInput.addEventListener('change', saveTgSettings);
    tgChatInput.addEventListener('change', saveTgSettings);

    function updateTinkoffUI() {
        if (!tinkoffTokenBadge || !tinkoffTokenInput) return;
        tinkoffTokenInput.value = tinkoffToken || '';
        if (tinkoffToken) {
            tinkoffTokenBadge.textContent = 'Подключен (токен сохранен)';
            tinkoffTokenBadge.style.background = 'rgba(8, 153, 129, 0.2)';
            tinkoffTokenBadge.style.color = '#089981';
            tinkoffTokenBadge.style.borderColor = '#089981';
        } else {
            tinkoffTokenBadge.textContent = 'Не задан';
            tinkoffTokenBadge.style.background = 'rgba(242, 54, 69, 0.15)';
            tinkoffTokenBadge.style.color = '#f23645';
            tinkoffTokenBadge.style.borderColor = '#f23645';
        }
    }

    if (saveTinkoffTokenBtn) {
        saveTinkoffTokenBtn.addEventListener('click', () => {
            const raw = (tinkoffTokenInput ? tinkoffTokenInput.value : '').trim();
            tinkoffToken = raw;
            config.network.tinkoffToken = raw;
            ConfigStore.save();
            updateTinkoffUI();

            if (tinkoffStatusText) {
                if (raw) {
                    tinkoffStatusText.textContent = '✅ Токен сохранен!';
                    tinkoffStatusText.style.color = '#089981';
                } else {
                    tinkoffStatusText.textContent = '⚠️ Токен очищен';
                    tinkoffStatusText.style.color = '#f23645';
                }
                setTimeout(() => { if (tinkoffStatusText) tinkoffStatusText.textContent = ''; }, 3500);
            }

            // Сброс кэша инструментов для повторной валидации
            tinkoffSharesCatalog = null;
            try { GM_setValue('tinkoff_shares_cache', null); } catch (e) {}

            fetchAllMoexStocks();
            renderTable();
        });
    }

    // Инициализация статуса токена в интерфейсе
    updateTinkoffUI();

    resetCooldownBtn.addEventListener('click', () => {
        lastAlertTimes = {};
        GM_setValue('moex_alert_times', '{}');
        renderTable();
    });

    cooldownSelect.addEventListener('change', () => {
        cooldownMinutes = parseInt(cooldownSelect.value, 10);
        config.alerts.cooldownMins = cooldownMinutes;
        ConfigStore.save();
    });

    alertDirectionSelect.addEventListener('change', () => {
        alertDirection = alertDirectionSelect.value;
        config.alerts.direction = alertDirection;
        ConfigStore.save();
    });

    climaxRvolSelect.addEventListener('change', () => {
        climaxRvolThreshold = parseFloat(climaxRvolSelect.value);
        config.thresholds.climaxRvol = climaxRvolThreshold;
        ConfigStore.save();
        renderTable();
    });

    openModeSelect.addEventListener('change', () => {
        openInNewTab = openModeSelect.value === 'new_tab';
        config.network.openInNewTab = openInNewTab;
        ConfigStore.save();
    });

    function closeAllToolbarDropdowns(except = null) {
        if (listDropdownMenu && listDropdownMenu !== except) listDropdownMenu.style.display = 'none';
        if (dirDropdownMenu && dirDropdownMenu !== except) dirDropdownMenu.style.display = 'none';
        if (indDropdownMenu && indDropdownMenu !== except) indDropdownMenu.style.display = 'none';
        if (rvolDropdownMenu && rvolDropdownMenu !== except) rvolDropdownMenu.style.display = 'none';
        if (tfDropdownMenu && tfDropdownMenu !== except) tfDropdownMenu.style.display = 'none';
        if (groupDropdownMenu && groupDropdownMenu !== except) groupDropdownMenu.classList.remove('show');
    }

    // 1. Выпадающее меню списков акций
    if (listSelectBtn && listDropdownMenu) {
        listSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = listDropdownMenu.style.display === 'block';
            closeAllToolbarDropdowns();
            listDropdownMenu.style.display = isOpen ? 'none' : 'block';
        });

        listDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = item.getAttribute('data-list');
                updateListFilterUI(chosen);
                listDropdownMenu.style.display = 'none';
                renderTable();
                renderFooterBar();
            });
        });
    }

    // 2. Выпадающее меню направления (Тип)
    if (dirSelectBtn && dirDropdownMenu) {
        dirSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dirDropdownMenu.style.display === 'block';
            closeAllToolbarDropdowns();
            dirDropdownMenu.style.display = isOpen ? 'none' : 'block';
        });

        dirDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = item.getAttribute('data-dir');
                updateDirectionFilterUI(chosen, true);
                dirDropdownMenu.style.display = 'none';
                renderTable();
                renderFooterBar();
            });
        });
    }

    // 3. Выпадающее меню индикаторов (Триггер)
    if (indSelectBtn && indDropdownMenu) {
        indSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = indDropdownMenu.style.display === 'block';
            closeAllToolbarDropdowns();
            indDropdownMenu.style.display = isOpen ? 'none' : 'block';
        });

        indDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = item.getAttribute('data-ind');
                updateIndicatorFilterUI(chosen, true);
                indDropdownMenu.style.display = 'none';
                renderTable();
                renderFooterBar();
            });
        });
    }

    // 4. Выпадающее меню объемов (RVOL)
    if (rvolSelectBtn && rvolDropdownMenu) {
        rvolSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = rvolDropdownMenu.style.display === 'block';
            closeAllToolbarDropdowns();
            rvolDropdownMenu.style.display = isOpen ? 'none' : 'block';
        });

        rvolDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = item.getAttribute('data-rvol');
                updateRvolFilterUI(chosen, true);
                rvolDropdownMenu.style.display = 'none';
                renderTable();
                renderFooterBar();
            });
        });
    }

    // 5. Выпадающее меню таймфрейма
    if (tfSelectBtn && tfDropdownMenu) {
        tfSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = tfDropdownMenu.style.display === 'block';
            closeAllToolbarDropdowns();
            tfDropdownMenu.style.display = isOpen ? 'none' : 'block';
        });

        tfDropdownMenu.querySelectorAll('.list-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = item.getAttribute('data-tf');
                updateTfFilterUI(chosen, true);
                tfDropdownMenu.style.display = 'none';
                renderTable();
                renderFooterBar();
            });
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#list-dropdown-wrapper') && listDropdownMenu) {
            listDropdownMenu.style.display = 'none';
        }
        if (!e.target.closest('#dir-dropdown-wrapper') && dirDropdownMenu) {
            dirDropdownMenu.style.display = 'none';
        }
        if (!e.target.closest('#ind-dropdown-wrapper') && indDropdownMenu) {
            indDropdownMenu.style.display = 'none';
        }
        if (!e.target.closest('#rvol-dropdown-wrapper') && rvolDropdownMenu) {
            rvolDropdownMenu.style.display = 'none';
        }
        if (!e.target.closest('#tf-dropdown-wrapper') && tfDropdownMenu) {
            tfDropdownMenu.style.display = 'none';
        }
        if (!e.target.closest('#group-select-wrapper') && groupDropdownMenu) {
            groupDropdownMenu.classList.remove('show');
        }
    });

    // Обработчики меню целевой группы графика (Т-Терминал)
    if (groupSelectBtn && groupDropdownMenu) {
        groupSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllToolbarDropdowns(groupDropdownMenu);
            groupDropdownMenu.classList.toggle('show');
        });

        groupDropdownMenu.querySelectorAll('.group-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const selGroup = item.getAttribute('data-group') || 'auto';
                updateGroupUI(selGroup, true);
                groupDropdownMenu.classList.remove('show');
                const label = GROUPS_LABELS[selGroup] || selGroup;
                showTerminalToast(`🎯 Целевой график: ${label}`);
            });
        });
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            config.filters.mode = modeSelect.value;
            ConfigStore.save();
            renderTable();
        });
    }
    if (tfSelect) {
        tfSelect.addEventListener('change', () => {
            config.filters.tf = tfSelect.value;
            ConfigStore.save();
            renderTable();
        });
    }
    if (volumeFilterSelect) {
        volumeFilterSelect.addEventListener('change', () => {
            minVolumeRub = parseFloat(volumeFilterSelect.value);
            config.filters.minVolumeRub = minVolumeRub;
            ConfigStore.save();
            renderTable();
        });
    }

    function saveWatchedTickers() {
        config.favorites = Array.from(watchedTickers);
        ConfigStore.save();
        if (wlCountLabel) wlCountLabel.textContent = `В списке: ${watchedTickers.size}`;
    }

    // Логика выдвижного поиска в шапке
    function openSearch() {
        searchBtn.style.display = 'none';
        searchInputContainer.style.display = 'flex';
        headerSearchInput.focus();
        headerSearchInput.select();
    }

    function closeSearch() {
        searchQuery = '';
        headerSearchInput.value = '';
        searchInputContainer.style.display = 'none';
        searchBtn.style.display = 'inline-flex';
        searchBtn.classList.remove('active-on');
        renderTable();
    }

    searchBtn.addEventListener('click', openSearch);

    searchClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSearch();
    });

    let searchDebounceTimer = null;
    headerSearchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchQuery = headerSearchInput.value.trim();
            searchBtn.classList.toggle('active-on', searchQuery.length > 0);
            renderTable();
        }, 120);
    });

    headerSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearch();
        }
    });

    headerSearchInput.addEventListener('blur', () => {
        if (headerSearchInput.value.trim() === '') {
            closeSearch();
        }
    });

    function updateTerminalHeaderButtonState() {
        const btn = document.getElementById('tbank-moex-screener-btn');
        if (!btn) return;
        const isVisible = host.style.display !== 'none';
        if (isVisible) {
            btn.style.backgroundColor = 'rgba(41, 98, 255, 0.22)';
            btn.style.borderColor = '#2962ff';
            btn.style.color = '#fff';
        } else {
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    }

    function setScreenerVisibility(show) {
        host.style.display = show ? 'block' : 'none';
        if (config.ui) {
            config.ui.visible = show;
            ConfigStore.save();
        }
        updateTerminalHeaderButtonState();
    }

    function toggleScreenerVisibility() {
        const isHidden = host.style.display === 'none';
        setScreenerVisibility(isHidden);
    }

    if (closeWidgetBtn) {
        closeWidgetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setScreenerVisibility(false);
        });
    }

    function setSettingsOpen(isOpen) {
        if (isOpen) {
            settingsPanel.style.display = 'block';
            tableContainer.style.display = 'none';
            if (filterToolbar) filterToolbar.style.display = 'none';
            settingsBtn.classList.add('active-on');
            const activeTab = shadow.querySelector('.settings-tab-btn.active');
            if (activeTab && activeTab.getAttribute('data-tab') === 'tab-system') {
                renderWatchlistUI();
            }
        } else {
            settingsPanel.style.display = 'none';
            tableContainer.style.display = 'block';
            if (filterToolbar) filterToolbar.style.display = 'flex';
            settingsBtn.classList.remove('active-on');
        }
    }

    settingsBtn.addEventListener('click', () => {
        const isOpen = settingsPanel.style.display === 'block';
        setSettingsOpen(!isOpen);
    });

    closeSettingsBtn.addEventListener('click', () => {
        setSettingsOpen(false);
    });

    // Логика ротации и подсчета в нижней информационной строке
    const TF_LIST = ['5m', '15m', '1h', '4h'];
    const TF_LABELS = { '5m': '5m', '15m': '15m', '1h': '60m', '4h': '4h' };
    let currentFooterTfIndex = 0;
    let footerRotateTimer = null;
    let isFooterHovered = false;

    function getTfSignalCounts(tfKey) {
        const rsiOffset = parseFloat(rsiSlider.value);
        const stochOffset = parseFloat(stochSlider.value);
        let bothLong = 0, bothShort = 0;
        let rsiLong = 0, rsiShort = 0;
        let sthLong = 0, sthShort = 0;

        for (const stock of allStocks) {
            if (currentListFilter === 'watched_only' && !watchedTickers.has(stock.ticker)) continue;
            if (currentListFilter === 'blue_chips' && !TOP_BLUE_CHIPS.has(stock.ticker)) continue;
            if (!stock.tf || !stock.tf[tfKey]) continue;
            const evalResult = evaluateTimeframe(stock.tf[tfKey], rsiOffset, stochOffset);
            if (evalResult.noData) continue;

            if (evalResult.longBoth) bothLong++;
            if (evalResult.shortBoth) bothShort++;

            if (evalResult.rsiOversold) rsiLong++;
            if (evalResult.rsiOverbought) rsiShort++;

            if (evalResult.stochOversold) sthLong++;
            if (evalResult.stochOverbought) sthShort++;
        }
        return { bothLong, bothShort, rsiLong, rsiShort, sthLong, sthShort };
    }

    function renderFooterBar() {
        if (!footerBar || !footerText) return;
        if (!allStocks || allStocks.length === 0) {
            footerText.innerHTML = '<span style="color:#787b86;">Загрузка данных...</span>';
            return;
        }

        const tfKey = TF_LIST[currentFooterTfIndex];
        const tfLabel = TF_LABELS[tfKey];
        const c = getTfSignalCounts(tfKey);

        footerText.style.opacity = '0';
        setTimeout(() => {
            footerText.innerHTML = `
                <span class="footer-badge-tf">${tfLabel}:</span>
                <span class="footer-lbl">RSI+STH</span> <span class="footer-val-long">${c.bothLong}</span><span class="footer-sep">|</span><span class="footer-val-short">${c.bothShort}</span>
                <span class="footer-dot">•</span>
                <span class="footer-lbl">RSI</span> <span class="footer-val-long">${c.rsiLong}</span><span class="footer-sep">|</span><span class="footer-val-short">${c.rsiShort}</span>
                <span class="footer-dot">•</span>
                <span class="footer-lbl">STH</span> <span class="footer-val-long">${c.sthLong}</span><span class="footer-sep">|</span><span class="footer-val-short">${c.sthShort}</span>
            `;
            footerText.style.opacity = '1';
        }, 120);

        const c5 = getTfSignalCounts('5m');
        const c15 = getTfSignalCounts('15m');
        const c1h = getTfSignalCounts('1h');
        const c4h = getTfSignalCounts('4h');
        footerText.title = `Сводка сигналов рынка (Long / Short):\n` +
            `• 5m:   RSI+STH ${c5.bothLong} | ${c5.bothShort}  •  RSI ${c5.rsiLong} | ${c5.rsiShort}  •  STH ${c5.sthLong} | ${c5.sthShort}\n` +
            `• 15m: RSI+STH ${c15.bothLong} | ${c15.bothShort}  •  RSI ${c15.rsiLong} | ${c15.rsiShort}  •  STH ${c15.sthLong} | ${c15.sthShort}\n` +
            `• 60m: RSI+STH ${c1h.bothLong} | ${c1h.bothShort}  •  RSI ${c1h.rsiLong} | ${c1h.rsiShort}  •  STH ${c1h.sthLong} | ${c1h.sthShort}\n` +
            `• 4h:   RSI+STH ${c4h.bothLong} | ${c4h.bothShort}  •  RSI ${c4h.rsiLong} | ${c4h.rsiShort}  •  STH ${c4h.sthLong} | ${c4h.sthShort}\n` +
            `(Кликните для переключения ТФ)`;
    }

    function rotateFooterTf() {
        currentFooterTfIndex = (currentFooterTfIndex + 1) % TF_LIST.length;
        renderFooterBar();
    }

    function startFooterRotation() {
        stopFooterRotation();
        footerRotateTimer = setInterval(() => {
            if (!isFooterHovered) {
                rotateFooterTf();
            }
        }, 3500);
    }

    function stopFooterRotation() {
        if (footerRotateTimer) {
            clearInterval(footerRotateTimer);
            footerRotateTimer = null;
        }
    }

    function updateStatusUI() {
        if (!statusText) return;
        if (!tinkoffToken) {
            statusText.innerHTML = '<span class="live-dot dot-yellow"></span> <span>Укажите токен Т-Инвестиций</span>';
            statusText.title = 'Для получения котировок укажите токен Т-Инвестиций в настройках';
            return;
        }
        if (isPaused) {
            statusText.innerHTML = '<span class="live-dot dot-gray"></span> <span>T-Invest: Пауза</span>';
            statusText.title = `Синхронизация и расчеты приостановлены (обновлено: ${lastUpdateTime || '—'}). Нажмите для возобновления работы.`;
        } else {
            const timeStr = lastUpdateTime || new Date().toLocaleTimeString();
            statusText.innerHTML = `<span class="live-dot dot-green"></span> <span>T-Invest Live • ${timeStr}</span>`;
            statusText.title = `Прямой поток Т-Инвестиций без задержки. Всего акций: ${allStocks.length}. Нажмите для паузы.`;
        }
    }

    function togglePause() {
        isPaused = !isPaused;
        if (config.network) {
            config.network.isPaused = isPaused;
            ConfigStore.save();
        }
        if (isPaused) {
            if (timerId) {
                clearInterval(timerId);
                timerId = null;
            }
            updateStatusUI();
            showTerminalToast('⏸ Синхронизация и расчеты на паузе');
        } else {
            updateStatusUI();
            showTerminalToast('▶ Синхронизация возобновлена');
            fetchAllMoexStocks(true);
            restartTimer();
        }
    }

    statusText.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePause();
    });

    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fetchAllMoexStocks(true);
        });
    }

    footerText.addEventListener('click', (e) => {
        e.stopPropagation();
        rotateFooterTf();
        startFooterRotation();
    });

    footerBar.addEventListener('click', (e) => {
        if (!e.target.closest('#status-text') && !e.target.closest('#refresh-btn')) {
            rotateFooterTf();
            startFooterRotation();
        }
    });

    footerBar.addEventListener('mouseenter', () => {
        isFooterHovered = true;
    });

    footerBar.addEventListener('mouseleave', () => {
        isFooterHovered = false;
    });

    // ==========================================
    // СВЕРХПЛАВНОЕ ПЕРЕТАСКИВАНИЕ И РЕСАЙЗ (60-144 FPS)
    // 1. Аппаратное ускорение через GPU: translate3d
    // 2. Throttling через requestAnimationFrame
    // 3. Защитный экран (Shield) от перехвата событий графиками TradingView
    // 4. Пауза перерисовки таблицы во время движения
    // ==========================================

    let isDragging = false;
    let isResizing = false;
    let needsRenderAfterDrag = false;

    // Экран изоляции курсора от графиков терминала
    const dragShield = document.createElement('div');
    dragShield.id = 'moex-drag-shield';
    dragShield.style.cssText = 'position: fixed; inset: 0; z-index: 2147483646; pointer-events: all; user-select: none; background: transparent; display: none;';
    document.body.appendChild(dragShield);

    // Восстановление позиции и размеров виджета
    let savedW = config.ui.width || 720;
    let savedH = config.ui.height || 520;
    widget.style.width = savedW + 'px';
    widget.style.height = savedH + 'px';

    let currentPosX = (config.ui.x !== null && config.ui.x !== undefined) ? config.ui.x : Math.max(10, window.innerWidth - savedW - 24);
    let currentPosY = (config.ui.y !== null && config.ui.y !== undefined) ? config.ui.y : 55;

    // Инициализация координат host через аппаратный translate3d
    host.style.top = '0px';
    host.style.left = '0px';
    host.style.right = 'auto';
    host.style.transform = `translate3d(${currentPosX}px, ${currentPosY}px, 0)`;
    if (config.ui && config.ui.visible === false) {
        host.style.display = 'none';
    }

    let dragStartX = 0, dragStartY = 0;
    let dragOriginX = currentPosX, dragOriginY = currentPosY;
    let targetPosX = currentPosX, targetPosY = currentPosY;
    let dragRafId = null;

    function applyDragTransform() {
        host.style.transform = `translate3d(${targetPosX}px, ${targetPosY}px, 0)`;
        dragRafId = null;
    }

    headerEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.search-box-wrapper') || e.target.closest('.list-dropdown-wrapper') || e.target.closest('#group-select-wrapper')) {
            return;
        }

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragOriginX = currentPosX;
        dragOriginY = currentPosY;

        host.style.willChange = 'transform';
        dragShield.style.cursor = 'move';
        dragShield.style.display = 'block';
        document.body.style.userSelect = 'none';

        e.preventDefault();
    });

    let resizeStartX = 0, resizeStartY = 0;
    let resizeStartW = 0, resizeStartH = 0;
    let targetW = savedW, targetH = savedH;
    let resizeRafId = null;

    function applyResize() {
        widget.style.width = targetW + 'px';
        widget.style.height = targetH + 'px';
        resizeRafId = null;
    }

    resizeHandle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        isResizing = true;
        resizeHandle.classList.add('active-resizing');

        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = widget.offsetWidth;
        resizeStartH = widget.offsetHeight;

        host.style.willChange = 'width, height';
        dragShield.style.cursor = 'nwse-resize';
        dragShield.style.display = 'block';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const maxW = window.innerWidth - 80;
            const maxH = window.innerHeight - 40;

            targetPosX = Math.max(0, Math.min(maxW, dragOriginX + deltaX));
            targetPosY = Math.max(0, Math.min(maxH, dragOriginY + deltaY));

            if (!dragRafId) {
                dragRafId = requestAnimationFrame(applyDragTransform);
            }
        } else if (isResizing) {
            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;

            const maxW = Math.max(580, window.innerWidth - 30);
            const maxH = Math.max(280, window.innerHeight - 30);

            targetW = Math.min(Math.max(580, resizeStartW + deltaX), maxW);
            targetH = Math.min(Math.max(280, resizeStartH + deltaY), maxH);

            if (!resizeRafId) {
                resizeRafId = requestAnimationFrame(applyResize);
            }
        }
    }, { passive: true });

    function endDragOrResize() {
        if (isDragging) {
            isDragging = false;
            if (dragRafId) {
                cancelAnimationFrame(dragRafId);
                applyDragTransform();
            }
            currentPosX = targetPosX;
            currentPosY = targetPosY;
            host.style.willChange = '';
            dragShield.style.display = 'none';
            document.body.style.userSelect = '';

            config.ui.x = Math.round(currentPosX);
            config.ui.y = Math.round(currentPosY);
            ConfigStore.save();

            if (needsRenderAfterDrag) {
                needsRenderAfterDrag = false;
                renderTable();
            }
        }

        if (isResizing) {
            isResizing = false;
            if (resizeRafId) {
                cancelAnimationFrame(resizeRafId);
                applyResize();
            }
            resizeHandle.classList.remove('active-resizing');
            savedW = targetW;
            savedH = targetH;
            host.style.willChange = '';
            dragShield.style.display = 'none';
            document.body.style.userSelect = '';

            config.ui.width = savedW;
            config.ui.height = savedH;
            ConfigStore.save();

            if (needsRenderAfterDrag) {
                needsRenderAfterDrag = false;
                renderTable();
            }
        }
    }

    window.addEventListener('pointerup', endDragOrResize);
    window.addEventListener('pointercancel', endDragOrResize);

    let debounceTimer = null;
    function triggerDebouncedRender() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(renderTable, 180);
    }

    rsiSlider.addEventListener('input', () => {
        updateSliderLabels();
        config.thresholds.rsi = parseFloat(rsiSlider.value);
        ConfigStore.save();
        triggerDebouncedRender();
    });
    stochSlider.addEventListener('input', () => {
        updateSliderLabels();
        config.thresholds.stoch = parseFloat(stochSlider.value);
        ConfigStore.save();
        triggerDebouncedRender();
    });

    let indicatorDebounceTimer = null;
    function onIndicatorSliderChange() {
        updateSliderLabels();
        if (!config.indicators) config.indicators = {};
        config.indicators.rsiPeriod = parseInt(rsiPeriodSlider.value, 10) || 14;
        config.indicators.stochPeriod = parseInt(stochPeriodSlider.value, 10) || 14;
        config.indicators.rvolDays = parseInt(rvolDaysSlider.value, 10) || 10;
        ConfigStore.save();

        clearTimeout(indicatorDebounceTimer);
        indicatorDebounceTimer = setTimeout(() => {
            candleCache.clear();
            computePriorityIndicators();
            triggerDebouncedRender();
            showTerminalToast(`⚙️ Периоды: RSI(${config.indicators.rsiPeriod}), Stoch(${config.indicators.stochPeriod}), RVOL(${config.indicators.rvolDays}д)`);
        }, 300);
    }

    if (rsiPeriodSlider) rsiPeriodSlider.addEventListener('input', onIndicatorSliderChange);
    if (stochPeriodSlider) stochPeriodSlider.addEventListener('input', onIndicatorSliderChange);
    if (rvolDaysSlider) rvolDaysSlider.addEventListener('input', onIndicatorSliderChange);

    shadow.querySelectorAll('thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            if (sortField === field) {
                sortAsc = !sortAsc;
            } else {
                sortField = field;
                sortAsc = (field === '5m' || field === '15m' || field === '1h' || field === '4h' || field === 'ticker');
            }
            config.filters.sortField = sortField;
            config.filters.sortAsc = sortAsc;
            ConfigStore.save();
            renderTable();
        });
    });

    function updateSortArrows() {
        ['ticker', 'change', 'rvol', '5m', '15m', '1h', '4h', 'status'].forEach(col => {
            const el = shadow.getElementById(`arr-${col}`);
            if (!el) return;
            el.textContent = (sortField === col) ? (sortAsc ? '▲' : '▼') : '';
        });
    }

    tbody.addEventListener('click', (e) => {
        const star = e.target.closest('.star-btn');
        if (star) {
            e.stopPropagation();
            const sym = star.getAttribute('data-star');
            if (watchedTickers.has(sym)) watchedTickers.delete(sym);
            else watchedTickers.add(sym);
            saveWatchedTickers();
            renderTable();
            return;
        }

        const link = e.target.closest('.ticker-link');
        if (link) {
            const ticker = link.getAttribute('data-ticker') || (link.getAttribute('data-symbol') || '').replace('MOEX:', '');
            // Открывать в новой вкладке только при зажатом Ctrl/Cmd, колесике мыши
            // ЛИБО если в настройках явно выбран режим "new_tab"
            const isCtrl = !!(e.ctrlKey || e.metaKey || e.button === 1);
            const forceNewTab = isCtrl || (openInNewTab === true);
            openTerminalSymbol(ticker, forceNewTab);
        }
    });

    function showTerminalToast(msg) {
        if (statusText) {
            statusText.innerHTML = `<span class="live-dot dot-yellow"></span> <span>${msg}</span>`;
            setTimeout(() => {
                if (statusText && statusText.innerHTML.includes(msg)) {
                    updateStatusUI();
                }
            }, 3000);
        }
    }

    // Полная эмуляция клика мыши (Pointer + Mouse Events для React)
    function simulateClick(el) {
        if (!el) return;
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        if (typeof el.focus === 'function') {
            try { el.focus(); } catch (e) {}
        }
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    // Нативная эмуляция ввода текста для React Controlled Input
    function typeIntoInput(input, text) {
        if (!input) return;
        input.focus();
        try {
            if (typeof input.select === 'function') input.select();
            const success = document.execCommand('insertText', false, text);
            if (!success || input.value !== text) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                    nativeSetter.call(input, text);
                } else {
                    input.value = text;
                }
                input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function isControlIcon(el) {
        if (!el) return true;
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const qa = (el.getAttribute('data-qa-type') || '').toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return aria.includes('закрыт') || aria.includes('удалит') || aria.includes('настройк') || aria.includes('свернуть') ||
               title.includes('закрыт') || title.includes('настройк') ||
               qa.includes('close') || qa.includes('settings') || qa.includes('collapse') || qa.includes('color') || qa.includes('remove') ||
               cls.includes('close') || cls.includes('settings') || cls.includes('menu') || cls.includes('drag') || cls.includes('resize');
    }

    function findInstrumentElementInside(container) {
        if (!container) return null;

        // 1. Поиск по data-qa-type
        const qaSelectors = [
            '[data-qa-type*="ticker"]',
            '[data-qa-type*="symbol"]',
            '[data-qa-type*="instrument"]',
            '[data-qa-type*="title"]',
            '[data-qa-type*="header-title"]'
        ];
        for (const sel of qaSelectors) {
            const match = container.querySelector(sel);
            if (match && !isControlIcon(match)) return match;
        }

        // 2. Поиск кликабельных кнопок или элементов с названием инструмента
        const candidates = Array.from(container.querySelectorAll('button, [role="button"], span, div, a'));
        for (const cand of candidates) {
            if (isControlIcon(cand)) continue;
            // Берем только листовые элементы (без вложенных тегов), чтобы не кликать по оберткам
            if (cand.children.length > 2) continue;
            const txt = (cand.innerText || cand.textContent || '').trim();
            if (txt.length >= 2 && txt.length <= 35) {
                if (!txt.includes('✕') && !txt.includes('⚙') && !txt.includes('...') && !txt.includes('1м') && !txt.includes('1д')) {
                    return cand;
                }
            }
        }
        return null;
    }

    function findWidgetInstrumentButton() {
        // Приоритет 1: Виджет Графика (с canvas или iframe)
        const allWidgets = Array.from(document.querySelectorAll('[data-widget-type], [class*="widget"], [class*="Widget"], [data-qa-type*="widget"]'))
            .filter(el => !el.closest('#tv-moex-screener-host'));

        const chartWidgets = allWidgets.filter(w => w.querySelector('canvas') || w.querySelector('iframe') || (w.getAttribute('data-widget-type') || '').includes('chart'));
        for (const cw of chartWidgets) {
            const header = cw.querySelector('[class*="header"], [class*="Header"], [data-qa-type*="header"]') || cw;
            const btn = findInstrumentElementInside(header);
            if (btn) return btn;
        }

        // Приоритет 2: Любой другой виджет терминала (стакан, заявка, инструмент)
        for (const w of allWidgets) {
            const header = w.querySelector('[class*="header"], [class*="Header"], [data-qa-type*="header"]');
            if (header) {
                const btn = findInstrumentElementInside(header);
                if (btn) return btn;
            }
        }

        // Приоритет 3: Прямой поиск в заголовках виджетов
        const standaloneHeaders = Array.from(document.querySelectorAll('[class*="widget-header"], [class*="WidgetHeader"], [data-qa-type*="widget-header"]'))
            .filter(el => !el.closest('#tv-moex-screener-host'));
        for (const h of standaloneHeaders) {
            const btn = findInstrumentElementInside(h);
            if (btn) return btn;
        }

        return null;
    }

    function findOpenTerminalInput() {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'))
            .filter(inp => !inp.closest('#tv-moex-screener-host'));

        for (const inp of inputs) {
            if (inp.offsetParent === null && inp.offsetWidth === 0 && inp.offsetHeight === 0) continue;

            const ph = (inp.placeholder || '').toLowerCase();
            const qa = (inp.getAttribute('data-qa-type') || '').toLowerCase();
            const cls = (inp.className || '').toLowerCase();
            const aria = (inp.getAttribute('aria-label') || '').toLowerCase();

            if (ph.includes('поиск') || ph.includes('инструмент') || ph.includes('тикер') || ph.includes('акци') ||
                qa.includes('search') || qa.includes('ticker') || qa.includes('symbol') || qa.includes('instrument') ||
                cls.includes('search') || aria.includes('поиск') || aria.includes('search')) {
                return inp;
            }
        }

        if (document.activeElement && document.activeElement.tagName === 'INPUT' && !document.activeElement.closest('#tv-moex-screener-host')) {
            return document.activeElement;
        }
        return null;
    }

    function fillAndSelectTicker(input, ticker) {
        console.log(`[MOEX Screener] Ввод тикера ${ticker} в поле:`, input);
        typeIntoInput(input, ticker);

        setTimeout(() => {
            // Эмуляция клавиши Enter
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));

            // Ищем строку с тикером в появившемся выпадающем списке результатов
            setTimeout(() => {
                const candidates = Array.from(document.querySelectorAll('[data-qa-type*="item"], [data-qa-type*="result"], [role="option"], [class*="item"], [class*="Item"], tr, [class*="row"]'))
                    .filter(el => !el.closest('#tv-moex-screener-host'));

                let matched = null;
                for (const c of candidates) {
                    const t = (c.innerText || c.textContent || '').toUpperCase();
                    if (t.includes(ticker)) {
                        matched = c;
                        break;
                    }
                }

                if (matched) {
                    console.log('[MOEX Screener] Клик по найденной строке инструмента:', matched);
                    simulateClick(matched);
                    showTerminalToast(`График: ${ticker}`);
                } else if (candidates.length > 0) {
                    console.log('[MOEX Screener] Клик по первому результату в списке:', candidates[0]);
                    simulateClick(candidates[0]);
                    showTerminalToast(`График: ${ticker}`);
                } else {
                    console.log(`[MOEX Screener] Тикер ${ticker} введен в поле поиска`);
                    showTerminalToast(`Тикер ${ticker} введен в поиск`);
                }
            }, 120);
        }, 120);
    }

    // ==========================================
    // ПРИВЯЗКА К ГРАФИКАМ ТЕРМИНАЛА Т-БАНКА
    // МГНОВЕННОЕ ПЕРЕКЛЮЧЕНИЕ ЧЕРЕЗ REACT FIBER
    // ==========================================

    function inPageFiberBridge() {
        const GROUPS_COLORS = {
            1: "rgb(255, 212, 80)", 2: "rgb(255, 123, 118)", 3: "rgb(163, 129, 255)", 4: "rgb(77, 195, 247)"
        };

        const GROUPS_NAMES = {
            'auto': 'Авто',
            'group1': '🟡 Группа 1',
            'group2': '🔴 Группа 2',
            'group3': '🟣 Группа 3',
            'group4': '🔵 Группа 4'
        };

        function getFiberProps(el) {
            if (!el) return null;
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
            if (!key) return null;
            let f = el[key];
            let d = 0;
            while (f && d < 30) {
                if (f.memoizedProps && typeof f.memoizedProps.selectSymbol === 'function') {
                    return f.memoizedProps;
                }
                f = f.return;
                d++;
            }
            return null;
        }

        function findPropsInContainer(w) {
            let p = getFiberProps(w);
            if (p) return p;
            const hdr = w.querySelector('[class*="header"], [class*="Header"], [data-qa-type*="header"]');
            if (hdr) {
                p = getFiberProps(hdr);
                if (p) return p;
            }
            const children = w.querySelectorAll('div, button, nav');
            for (let i = 0; i < Math.min(children.length, 12); i++) {
                p = getFiberProps(children[i]);
                if (p) return p;
            }
            return null;
        }

        function getGroupId(props, el) {
            if (props && props.settings && props.settings.groupId) {
                return props.settings.groupId;
            }
            if (props && props.groupId) {
                return props.groupId;
            }
            if (el) {
                const icon = el.querySelector('[class*="GroupMenu-icon-"]');
                if (icon && icon.style && icon.style.color) {
                    const col = icon.style.color;
                    const id = Object.keys(GROUPS_COLORS).find(k => GROUPS_COLORS[k] === col);
                    if (id) return 'group' + id;
                }
            }
            return 'group0';
        }

        window.__moexFiberSwitch = function(ticker, targetGroup = 'auto') {
            ticker = (ticker || '').trim().toUpperCase();
            if (!ticker) return { success: false, reason: 'empty_ticker' };

            // Поиск всех виджетов графика на странице (исключая оверлей самого скринера)
            const allWidgets = Array.from(document.querySelectorAll('[data-widget-type], [data-widget-id]'))
                .filter(el => !el.closest('#tv-moex-screener-host'));

            const candidates = [];
            for (const w of allWidgets) {
                const props = findPropsInContainer(w);
                if (props && typeof props.selectSymbol === 'function') {
                    const wtype = (w.getAttribute('data-widget-type') || '').toUpperCase();
                    const isChart = wtype.includes('CHART') || wtype.includes('TV_WIDGET') || !!w.querySelector('canvas, iframe');
                    const gid = getGroupId(props, w);
                    candidates.push({ element: w, props, groupId: gid, isChart, type: wtype });
                }
            }

            if (candidates.length === 0) {
                return { success: false, reason: 'no_widgets_found' };
            }

            let target = null;
            if (targetGroup !== 'auto') {
                target = candidates.find(c => c.groupId === targetGroup && c.isChart) ||
                         candidates.find(c => c.groupId === targetGroup);
            }
            if (!target) {
                target = candidates.find(c => c.isChart) || candidates[0];
            }

            if (target && target.props && typeof target.props.selectSymbol === 'function') {
                console.log(`[MOEX Screener] ⚡ React Fiber: смена ${ticker} в группе ${target.groupId} (${target.isChart ? 'График' : 'Виджет'})`);
                target.props.selectSymbol(ticker);
                const grpName = GROUPS_NAMES[target.groupId] || target.groupId;
                return { success: true, group: target.groupId, groupName: grpName, isChart: target.isChart };
            }

            return { success: false, reason: 'select_symbol_not_executed' };
        };
    }

    function injectFiberBridge() {
        if (document.getElementById('moex-fiber-bridge-script')) return;
        try {
            const script = document.createElement('script');
            script.id = 'moex-fiber-bridge-script';
            script.type = 'text/javascript';
            script.textContent = `(${inPageFiberBridge.toString()})();`;
            (document.head || document.documentElement).appendChild(script);
            console.log('[MOEX Screener] ⚡ In-page Fiber Bridge успешно внедрен');
        } catch (e) {
            console.error('[MOEX Screener] Ошибка внедрения Fiber bridge:', e);
        }
    }

    let currentActiveTerminalTicker = null;
    let lastSwitchedTicker = null;
    let lastSwitchTimestamp = 0;

    function highlightActiveTickerInTable(ticker) {
        if (!tbody) return;
        ticker = (ticker || '').trim().toUpperCase();
        const rows = tbody.querySelectorAll('tr[data-ticker]');
        rows.forEach(r => {
            if (r.getAttribute('data-ticker') === ticker) {
                r.classList.add('row-active-ticker');
            } else {
                r.classList.remove('row-active-ticker');
            }
        });
    }

    function switchTerminalTicker(ticker) {
        ticker = (ticker || '').trim().toUpperCase();
        if (!ticker) return;

        // Защита от дребезга / повторных кликов по тому же тикеру
        const now = Date.now();
        if (ticker === lastSwitchedTicker && (now - lastSwitchTimestamp < 400)) {
            return;
        }
        lastSwitchedTicker = ticker;
        lastSwitchTimestamp = now;

        currentActiveTerminalTicker = ticker;
        highlightActiveTickerInTable(ticker);

        console.log(`[MOEX Screener] Переключение графика на ${ticker} (целевая группа: ${currentChartGroup})...`);

        // СТРАТЕГИЯ 0: Мгновенное переключение через React Fiber (Основная)
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (typeof win.__moexFiberSwitch === 'function') {
            try {
                const res = win.__moexFiberSwitch(ticker, currentChartGroup);
                if (res && res.success) {
                    console.log('[MOEX Screener] ⚡ Успешно переключено через React Fiber:', res);
                    showTerminalToast(`⚡ График (${res.groupName}): ${ticker}`);
                    return;
                }
            } catch (err) {
                console.warn('[MOEX Screener] Ошибка вызова __moexFiberSwitch:', err);
            }
        }

        // СТРАТЕГИЯ 1: Инпут поиска уже открыт
        const activeInput = findOpenTerminalInput();
        if (activeInput) {
            console.log('[MOEX Screener] Поле поиска уже открыто:', activeInput);
            fillAndSelectTicker(activeInput, ticker);
            return;
        }

        // СТРАТЕГИЯ 2: Клик по тикеру в шапке виджета графика
        const instrumentBtn = findWidgetInstrumentButton();
        if (instrumentBtn) {
            console.log('[MOEX Screener] Нажатие на кнопку тикера в шапке:', instrumentBtn);
            simulateClick(instrumentBtn);

            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                const popupInput = findOpenTerminalInput();
                if (popupInput) {
                    clearInterval(timer);
                    console.log('[MOEX Screener] Всплывающее поле поиска появилось:', popupInput);
                    fillAndSelectTicker(popupInput, ticker);
                } else if (attempts >= 12) {
                    clearInterval(timer);
                    console.warn('[MOEX Screener] Меню поиска не открылось после клика');
                    showTerminalToast('⚠️ Поле поиска графика не открылось');
                }
            }, 60);
            return;
        }

        // СТРАТЕГИЯ 3: Глобальная кнопка поиска
        const globalSearch = document.querySelector('[data-qa-type*="search"], button[aria-label*="поиск" i], [class*="search-button"]');
        if (globalSearch && !globalSearch.closest('#tv-moex-screener-host')) {
            console.log('[MOEX Screener] Вызов глобального поиска терминала:', globalSearch);
            simulateClick(globalSearch);
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                const popupInput = findOpenTerminalInput();
                if (popupInput) {
                    clearInterval(timer);
                    fillAndSelectTicker(popupInput, ticker);
                } else if (attempts >= 12) {
                    clearInterval(timer);
                    showTerminalToast('⚠️ Поле поиска терминала не открылось');
                }
            }, 60);
            return;
        }

        console.warn('[MOEX Screener] Виджет графика не найден в терминале.');
        showTerminalToast('⚠️ Виджет графика не найден в терминале');
    }

    function openTerminalSymbol(ticker, inNewTab) {
        if (inNewTab) {
            window.open(`https://www.tbank.ru/invest/stocks/${encodeURIComponent(ticker)}/`, '_blank');
        } else {
            switchTerminalTicker(ticker);
        }
    }

    function addTickersFromInput() {
        if (!wlInputAdd) return;
        const val = wlInputAdd.value.trim().toUpperCase();
        if (!val) return;
        const parts = val.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
        let addedCount = 0;
        parts.forEach(t => {
            if (t.length >= 2 && !watchedTickers.has(t)) {
                watchedTickers.add(t);
                addedCount++;
            }
        });
        wlInputAdd.value = '';
        if (addedCount > 0) {
            saveWatchedTickers();
            renderWatchlistUI();
            renderTable();
            showTerminalToast(`Добавлено тикеров: +${addedCount}`);
        }
    }

    if (wlBtnAdd) {
        wlBtnAdd.addEventListener('click', addTickersFromInput);
    }
    if (wlInputAdd) {
        wlInputAdd.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTickersFromInput();
            }
        });
    }

    if (wlSelectBluechips) {
        wlSelectBluechips.addEventListener('click', () => {
            FALLBACK_BLUE_CHIPS.slice(0, 15).forEach(t => watchedTickers.add(t));
            saveWatchedTickers();
            renderWatchlistUI();
            renderTable();
            showTerminalToast('Добавлен Топ-15 голубых фишек');
        });
    }

    if (wlClearAll) {
        wlClearAll.addEventListener('click', () => {
            if (watchedTickers.size === 0) return;
            watchedTickers.clear();
            saveWatchedTickers();
            renderWatchlistUI();
            renderTable();
            showTerminalToast('Список отслеживаемых очищен');
        });
    }

    function renderWatchlistUI() {
        if (!wlChipsContainer) return;
        if (wlCountLabel) wlCountLabel.textContent = `В списке: ${watchedTickers.size}`;

        if (watchedTickers.size === 0) {
            wlChipsContainer.innerHTML = '<span style="color: #8b949e; font-size: 11px; padding: 4px;">Список пуст. Введите тикеры выше или нажмите «Топ-15 фишек».</span>';
            return;
        }

        const sortedTickers = Array.from(watchedTickers).sort();
        wlChipsContainer.innerHTML = sortedTickers.map(ticker => {
            return `<span class="wl-chip"><span>${ticker}</span><span class="wl-chip-del" data-del-ticker="${ticker}" title="Удалить ${ticker}">✕</span></span>`;
        }).join('');

        wlChipsContainer.querySelectorAll('.wl-chip-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ticker = btn.getAttribute('data-del-ticker');
                if (ticker && watchedTickers.has(ticker)) {
                    watchedTickers.delete(ticker);
                    saveWatchedTickers();
                    renderWatchlistUI();
                    renderTable();
                }
            });
        });
    }

    intervalSelect.addEventListener('change', () => {
        config.network.refreshIntervalMs = parseInt(intervalSelect.value, 10);
        ConfigStore.save();
        restartTimer();
    });

    // ==========================================
    // ПРЯМОЙ ШЛЮЗ T-INVESTMENTS REST API (Т-БАНК)
    // РЕАЛЬНЫЙ РАСЧЕТ ИНДИКАТОРОВ (0 СЕК ЗАДЕРЖКИ)
    // ==========================================

    function fetchTinkoff(endpoint, body = {}) {
        return new Promise((resolve, reject) => {
            if (!tinkoffToken) {
                reject(new Error('NO_TOKEN'));
                return;
            }
            const url = `https://invest-public-api.tinkoff.ru/rest/${endpoint}`;
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tinkoffToken}`,
                        'x-app-name': 'antigravity.moex-screener'
                    },
                    data: JSON.stringify(body),
                    timeout: 20000,
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                reject(new Error(`Ошибка парсинга ответа: ${e.message}`));
                            }
                        } else {
                            let errMsg = `HTTP ${response.status}`;
                            try {
                                const errJson = JSON.parse(response.responseText);
                                if (errJson.message) errMsg += `: ${errJson.message}`;
                                else if (errJson.description) errMsg += `: ${errJson.description}`;
                            } catch (e) {
                                if (response.responseText) errMsg += `: ${response.responseText.slice(0, 100)}`;
                            }
                            reject(new Error(errMsg));
                        }
                    },
                    onerror: function(err) {
                        reject(new Error(`Сетевая ошибка Т-Инвестиций: ${err.error || 'Network error'}`));
                    },
                    ontimeout: function() {
                        reject(new Error('Таймаут Т-Инвестиций (20с)'));
                    }
                });
            } else {
                fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${tinkoffToken}`,
                        'x-app-name': 'antigravity.moex-screener'
                    },
                    body: JSON.stringify(body)
                })
                .then(r => r.json())
                .then(resolve)
                .catch(reject);
            }
        });
    }

    function parseQuotation(q) {
        if (!q) return 0;
        const units = typeof q.units === 'string' ? parseInt(q.units, 10) : (Number(q.units) || 0);
        const nano = typeof q.nano === 'string' ? parseInt(q.nano, 10) : (Number(q.nano) || 0);
        return units + (nano / 1e9);
    }

    function convertTinkoffCandle(c) {
        return {
            open: parseQuotation(c.open),
            high: parseQuotation(c.high),
            low: parseQuotation(c.low),
            close: parseQuotation(c.close),
            volume: typeof c.volume === 'string' ? parseInt(c.volume, 10) : (c.volume || 0),
            time: c.time
        };
    }

    let tinkoffSharesCatalog = null;

    async function getTinkoffShares() {
        if (tinkoffSharesCatalog && tinkoffSharesCatalog.length > 0) {
            return tinkoffSharesCatalog;
        }
        try {
            const cached = GM_getValue('tinkoff_shares_cache', null);
            if (cached && Array.isArray(cached.shares) && cached.shares.length > 0) {
                const ageHours = (Date.now() - (cached.timestamp || 0)) / (1000 * 60 * 60);
                if (ageHours < 24) {
                    tinkoffSharesCatalog = cached.shares;
                    return tinkoffSharesCatalog;
                }
            }
        } catch (e) {}

        const resp = await fetchTinkoff('tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares', {
            instrumentStatus: 'INSTRUMENT_STATUS_BASE'
        });

        if (!resp || !Array.isArray(resp.instruments)) {
            throw new Error('Некорректный ответ каталога инструментов Т-Инвестиций');
        }

        // Фильтрация: строго секция TQBR в рублях
        const tqbrShares = [];
        resp.instruments.forEach(inst => {
            const cls = inst.classCode || inst.class_code;
            const cur = (inst.currency || '').toLowerCase();
            if (cls === 'TQBR' && cur === 'rub') {
                tqbrShares.push({
                    figi: inst.figi,
                    uid: inst.uid || inst.instrument_uid || inst.figi,
                    ticker: inst.ticker,
                    name: inst.name || inst.ticker,
                    lot: inst.lot || 1,
                    classCode: 'TQBR'
                });
            }
        });

        if (tqbrShares.length > 0) {
            tinkoffSharesCatalog = tqbrShares;
            try {
                GM_setValue('tinkoff_shares_cache', { timestamp: Date.now(), shares: tqbrShares });
            } catch (e) {}
        }

        return tqbrShares;
    }

    // Расчет классического RSI(period) по методу Wilder (RMA)
    function calcRSI(candles, period = 14) {
        if (!candles || candles.length <= period) return null;
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (let i = period + 1; i < candles.length; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // Расчет классического Slow Stochastic (14, 3, 3) со сглаживанием SMA (%K и %D)
    function calcStoch(candles, period = 14, smoothK = 3, smoothD = 3) {
        if (!candles || candles.length < period) return { k: null, d: null };

        // Расчет сырого Fast %K для свечи с индексом barIdx
        function getRawK(barIdx) {
            if (barIdx < period - 1) return null;
            let highest = -Infinity, lowest = Infinity;
            for (let j = barIdx - period + 1; j <= barIdx; j++) {
                if (candles[j].high > highest) highest = candles[j].high;
                if (candles[j].low < lowest) lowest = candles[j].low;
            }
            const close = candles[barIdx].close;
            if (highest === lowest) return 50;
            return Math.max(0, Math.min(100, ((close - lowest) / (highest - lowest)) * 100));
        }

        // Расчет сглаженного Slow %K (SMA от raw %K с периодом smoothK) для бара barIdx
        function getSlowK(barIdx) {
            const count = Math.min(smoothK, barIdx - period + 2);
            if (count <= 0) return null;
            let sum = 0;
            for (let m = 0; m < count; m++) {
                const r = getRawK(barIdx - m);
                if (r === null) return null;
                sum += r;
            }
            return sum / count;
        }

        const lastIdx = candles.length - 1;
        const currentK = getSlowK(lastIdx);
        if (currentK === null) return { k: null, d: null };

        // Расчет сигнальной линии Slow %D (SMA от Slow %K с периодом smoothD)
        const countD = Math.min(smoothD, candles.length - period - smoothK + 2);
        let currentD = currentK;
        if (countD > 0) {
            let sumD = 0;
            let validD = 0;
            for (let m = 0; m < countD; m++) {
                const sk = getSlowK(lastIdx - m);
                if (sk !== null) {
                    sumD += sk;
                    validD++;
                }
            }
            if (validD > 0) currentD = sumD / validD;
        }

        return { k: currentK, d: currentD };
    }

    // Извлечение сигнального значения из ответа официального метода GetTechAnalysis
    function extractTechAnalysisSignal(res) {
        if (!res || res.status !== 'fulfilled' || !res.value) return null;
        const v = res.value;
        const list = Array.isArray(v.technicalIndicators) ? v.technicalIndicators : (Array.isArray(v.technical_indicators) ? v.technical_indicators : null);
        if (!list || list.length === 0) return null;
        const last = list[list.length - 1];
        if (last && last.signal) {
            return parseQuotation(last.signal);
        }
        return null;
    }

    let isComputingIndicators = false;
    const candleCache = new Map(); // ticker -> { timestamp }

    async function computePriorityIndicators(isManual = false) {
        if (isPaused && !isManual) return;
        if (!tinkoffToken || isComputingIndicators) return;
        isComputingIndicators = true;

        try {
            // Формируем список приоритетных тикеров:
            // 1. Избранное пользователя (★)
            // 2. Голубые фишки (TOP_BLUE_CHIPS)
            // 3. Топ-25 акций по списку
            const prioritySet = new Set();
            watchedTickers.forEach(t => prioritySet.add(t));
            TOP_BLUE_CHIPS.forEach(t => prioritySet.add(t));
            allStocks.slice(0, 25).forEach(s => prioritySet.add(s.ticker));

            const now = Date.now();
            const queue = [];
            const stockMap = new Map();
            allStocks.forEach(s => stockMap.set(s.ticker, s));

            prioritySet.forEach(ticker => {
                const stock = stockMap.get(ticker);
                if (stock && stock.figi) {
                    const cached = candleCache.get(ticker);
                    // Обновляем свечи и индикаторы каждые 60 секунд
                    if (!cached || (now - cached.timestamp > 60000)) {
                        queue.push(stock);
                    }
                }
            });

            if (queue.length === 0) {
                checkAlertsAndCooldown();
                return;
            }

            const concurrency = 2; // Бережная параллельность для rate limits
            let updatedCount = 0;

            async function worker() {
                while (queue.length > 0) {
                    const stock = queue.shift();
                    try {
                        const rsiPeriod = (config.indicators && config.indicators.rsiPeriod) || 14;
                        const stochPeriod = (config.indicators && config.indicators.stochPeriod) || 14;
                        const rvolDays = (config.indicators && config.indicators.rvolDays) || 10;

                        const nowIso = new Date().toISOString();
                        const from1DayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
                        const from7DayIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
                        const from30DayIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
                        const daysLookback = Math.max(35, rvolDays * 2 + 10);
                        const fromDayIso = new Date(Date.now() - daysLookback * 24 * 3600 * 1000).toISOString();

                        // Запрос свечей и официального расчета RSI (GetTechAnalysis) через API Т-Инвестиций
                        const [
                            c5mRes, c15mRes, c1hRes, c4hRes, cDayRes,
                            rsi5mRes, rsi15mRes, rsi1hRes, rsi4hRes, rsiDayRes
                        ] = await Promise.allSettled([
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                                figi: stock.figi,
                                instrumentId: stock.figi,
                                from: from1DayIso,
                                to: nowIso,
                                interval: 'CANDLE_INTERVAL_5_MIN'
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                                figi: stock.figi,
                                instrumentId: stock.figi,
                                from: from1DayIso,
                                to: nowIso,
                                interval: 'CANDLE_INTERVAL_15_MIN'
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                                figi: stock.figi,
                                instrumentId: stock.figi,
                                from: from7DayIso,
                                to: nowIso,
                                interval: 'CANDLE_INTERVAL_HOUR'
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                                figi: stock.figi,
                                instrumentId: stock.figi,
                                from: from30DayIso,
                                to: nowIso,
                                interval: 'CANDLE_INTERVAL_4_HOUR'
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
                                figi: stock.figi,
                                instrumentId: stock.figi,
                                from: fromDayIso,
                                to: nowIso,
                                interval: 'CANDLE_INTERVAL_DAY'
                            }),
                            // Прямой расчет RSI через официальный метод GetTechAnalysis T-Invest API
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetTechAnalysis', {
                                indicatorType: 'INDICATOR_TYPE_RSI',
                                instrumentId: stock.figi,
                                from: from1DayIso,
                                to: nowIso,
                                interval: 'INDICATOR_INTERVAL_FIVE_MINUTES',
                                typeOfPrice: 'TYPE_OF_PRICE_CLOSE',
                                length: rsiPeriod
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetTechAnalysis', {
                                indicatorType: 'INDICATOR_TYPE_RSI',
                                instrumentId: stock.figi,
                                from: from1DayIso,
                                to: nowIso,
                                interval: 'INDICATOR_INTERVAL_FIFTEEN_MINUTES',
                                typeOfPrice: 'TYPE_OF_PRICE_CLOSE',
                                length: rsiPeriod
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetTechAnalysis', {
                                indicatorType: 'INDICATOR_TYPE_RSI',
                                instrumentId: stock.figi,
                                from: from7DayIso,
                                to: nowIso,
                                interval: 'INDICATOR_INTERVAL_ONE_HOUR',
                                typeOfPrice: 'TYPE_OF_PRICE_CLOSE',
                                length: rsiPeriod
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetTechAnalysis', {
                                indicatorType: 'INDICATOR_TYPE_RSI',
                                instrumentId: stock.figi,
                                from: from30DayIso,
                                to: nowIso,
                                interval: 'INDICATOR_INTERVAL_4_HOUR',
                                typeOfPrice: 'TYPE_OF_PRICE_CLOSE',
                                length: rsiPeriod
                            }),
                            fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetTechAnalysis', {
                                indicatorType: 'INDICATOR_TYPE_RSI',
                                instrumentId: stock.figi,
                                from: fromDayIso,
                                to: nowIso,
                                interval: 'INDICATOR_INTERVAL_ONE_DAY',
                                typeOfPrice: 'TYPE_OF_PRICE_CLOSE',
                                length: rsiPeriod
                            })
                        ]);

                        const c5m = (c5mRes.status === 'fulfilled' && c5mRes.value && Array.isArray(c5mRes.value.candles))
                            ? c5mRes.value.candles.map(convertTinkoffCandle) : [];
                        const c15m = (c15mRes.status === 'fulfilled' && c15mRes.value && Array.isArray(c15mRes.value.candles))
                            ? c15mRes.value.candles.map(convertTinkoffCandle) : [];
                        const c1h = (c1hRes.status === 'fulfilled' && c1hRes.value && Array.isArray(c1hRes.value.candles))
                            ? c1hRes.value.candles.map(convertTinkoffCandle) : [];
                        const c4h = (c4hRes.status === 'fulfilled' && c4hRes.value && Array.isArray(c4hRes.value.candles))
                            ? c4hRes.value.candles.map(convertTinkoffCandle) : [];
                        const cDay = (cDayRes.status === 'fulfilled' && cDayRes.value && Array.isArray(cDayRes.value.candles))
                            ? cDayRes.value.candles.map(convertTinkoffCandle) : [];

                        // Привязка последней цены к формирующейся свече
                        if (stock.price) {
                            [c5m, c15m, c1h, c4h, cDay].forEach(list => {
                                if (list.length > 0) {
                                    const last = list[list.length - 1];
                                    last.close = stock.price;
                                    last.high = Math.max(last.high, stock.price);
                                    last.low = Math.min(last.low, stock.price);
                                }
                            });
                        }

                        // Значения RSI напрямую от API Т-Инвестиций (GetTechAnalysis)
                        const apiRsi5m = extractTechAnalysisSignal(rsi5mRes);
                        const apiRsi15m = extractTechAnalysisSignal(rsi15mRes);
                        const apiRsi1h = extractTechAnalysisSignal(rsi1hRes);
                        const apiRsi4h = extractTechAnalysisSignal(rsi4hRes);
                        const apiRsiDay = extractTechAnalysisSignal(rsiDayRes);

                        // Fallback на локальный расчет, если GetTechAnalysis вернул пустой результат
                        const rsi5m = apiRsi5m !== null ? apiRsi5m : calcRSI(c5m, rsiPeriod);
                        const rsi15m = apiRsi15m !== null ? apiRsi15m : calcRSI(c15m, rsiPeriod);
                        const rsi1h = apiRsi1h !== null ? apiRsi1h : calcRSI(c1h, rsiPeriod);
                        const rsi4h = apiRsi4h !== null ? apiRsi4h : calcRSI(c4h, rsiPeriod);
                        const dailyRsi = apiRsiDay !== null ? apiRsiDay : calcRSI(cDay, rsiPeriod);

                        // Индикаторы таймфреймов: официальный RSI + сглаженный Slow Stochastic (14, 3, 3)
                        const stoch5m = calcStoch(c5m, stochPeriod, 3, 3);
                        const stoch15m = calcStoch(c15m, stochPeriod, 3, 3);
                        const stoch1h = calcStoch(c1h, stochPeriod, 3, 3);
                        const stoch4h = calcStoch(c4h, stochPeriod, 3, 3);

                        const tf5m = { rsi: rsi5m, k: stoch5m.k, d: stoch5m.d };
                        const tf15m = { rsi: rsi15m, k: stoch15m.k, d: stoch15m.d };
                        const tf1h = { rsi: rsi1h, k: stoch1h.k, d: stoch1h.d };
                        const tf4h = { rsi: rsi4h, k: stoch4h.k, d: stoch4h.d };

                        let rvol = stock.rvol || 1.0;
                        if (cDay.length > 0) {
                            const todayCandle = cDay[cDay.length - 1];
                            const todayVolLots = todayCandle.volume || 0;
                            if (stock.price) {
                                stock.turnover = todayVolLots * (stock.lot || 1) * stock.price;
                            }
                            const pastDaysSlice = cDay.slice(-(rvolDays + 1), -1);
                            if (pastDaysSlice.length > 0) {
                                const avgLots = pastDaysSlice.reduce((s, c) => s + (c.volume || 0), 0) / pastDaysSlice.length;
                                if (avgLots > 0 && todayVolLots > 0) {
                                    rvol = todayVolLots / avgLots;
                                }
                            }
                        }

                        stock.tf = { '5m': tf5m, '15m': tf15m, '1h': tf1h, '4h': tf4h };
                        stock.dailyRsi = dailyRsi;
                        stock.rvol = rvol;

                        candleCache.set(stock.ticker, { timestamp: Date.now() });
                        updatedCount++;

                        if (updatedCount % 4 === 0 && !document.hidden) {
                            triggerDebouncedRender();
                            renderFooterBar();
                        }

                        // Плавный интервал между запросами воркера
                        await new Promise(r => setTimeout(r, 120));

                    } catch (e) {
                        // мягкий пропуск ошибки единичного инструмента
                    }
                }
            }

            const workers = [];
            for (let i = 0; i < concurrency; i++) workers.push(worker());
            await Promise.all(workers);

            checkAlertsAndCooldown();
            if (!document.hidden) {
                renderTable();
                renderFooterBar();
            }

            // Обновляем кэш со свежими индикаторами
            try {
                GM_setValue('moex_quotes_cache', { timestamp: Date.now(), stocks: allStocks });
            } catch (e) {}

        } finally {
            isComputingIndicators = false;
        }
    }

    async function fetchAllMoexStocks(isManual = false) {
        if (isPaused && !isManual) return;

        if (!tinkoffToken) {
            updateStatusUI();
            renderTable();
            renderFooterBar();
            return;
        }

        if (refreshBtn) refreshBtn.classList.add('spinning');
        if (statusText) {
            statusText.innerHTML = '<span class="live-dot dot-yellow"></span> <span>Опрос Т-Инвестиций...</span>';
        }

        try {
            const shares = await getTinkoffShares();
            if (!shares || shares.length === 0) {
                throw new Error('Список акций MOEX TQBR пуст');
            }

            const figis = shares.map(s => s.figi);
            const closeInstruments = shares.map(s => ({ instrumentId: s.figi }));

            // 2 пакетных запроса: последние цены и цены закрытия для всех акций TQBR
            const [lastPricesResp, closePricesResp] = await Promise.all([
                fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetLastPrices', { figi: figis }),
                fetchTinkoff('tinkoff.public.invest.api.contract.v1.MarketDataService/GetClosePrices', { instruments: closeInstruments })
            ]);

            const lastPriceMap = new Map();
            if (lastPricesResp && Array.isArray(lastPricesResp.lastPrices)) {
                lastPricesResp.lastPrices.forEach(lp => {
                    const p = parseQuotation(lp.price);
                    if (p > 0) lastPriceMap.set(lp.figi, { price: p, time: lp.time });
                });
            }

            const closePriceMap = new Map();
            if (closePricesResp && Array.isArray(closePricesResp.closePrices)) {
                closePricesResp.closePrices.forEach(cp => {
                    const p = parseQuotation(cp.price);
                    if (p > 0) closePriceMap.set(cp.figi, p);
                });
            }

            // Сохраняем ранее рассчитанные индикаторы
            const prevStockMap = new Map();
            allStocks.forEach(s => prevStockMap.set(s.ticker, s));

            const newStocks = [];
            shares.forEach(share => {
                const lp = lastPriceMap.get(share.figi);
                const closeP = closePriceMap.get(share.figi);
                const prev = prevStockMap.get(share.ticker);

                const price = lp ? lp.price : (prev ? prev.price : null);
                if (!price && !closeP) return;

                let change = 0;
                if (price && closeP && closeP > 0) {
                    change = ((price - closeP) / closeP) * 100;
                } else if (prev && prev.change !== undefined) {
                    change = prev.change;
                }

                let timeStr = '';
                if (lp && lp.time) {
                    try {
                        const d = new Date(lp.time);
                        timeStr = d.toLocaleTimeString();
                    } catch (e) {
                        timeStr = '';
                    }
                } else if (prev) {
                    timeStr = prev.time;
                }

                newStocks.push({
                    fullSymbol: `MOEX:${share.ticker}`,
                    ticker: share.ticker,
                    description: share.name || share.ticker,
                    figi: share.figi,
                    uid: share.uid,
                    lot: share.lot || 1,
                    price: price,
                    change: change,
                    turnover: prev ? (prev.turnover || 0) : 0,
                    time: timeStr,
                    tf: prev ? prev.tf : {
                        '5m':  { rsi: null, k: null },
                        '15m': { rsi: null, k: null },
                        '1h':  { rsi: null, k: null },
                        '4h':  { rsi: null, k: null }
                    },
                    dailyRsi: prev ? prev.dailyRsi : null,
                    rvol: prev ? prev.rvol : 1.0
                });
            });

            newStocks.sort((a, b) => {
                const aTop = TOP_BLUE_CHIPS.has(a.ticker) ? 1 : 0;
                const bTop = TOP_BLUE_CHIPS.has(b.ticker) ? 1 : 0;
                if (aTop !== bTop) return bTop - aTop;
                return (b.turnover || 0) - (a.turnover || 0);
            });

            allStocks = newStocks;

            // Кэширование для мгновенного старта при F5
            try {
                GM_setValue('moex_quotes_cache', { timestamp: Date.now(), stocks: allStocks });
            } catch (e) {}

            const currentTime = new Date().toLocaleTimeString();
            lastUpdateTime = currentTime;
            updateStatusUI();

            // Немедленная отрисовка
            if (!document.hidden) {
                renderTable();
                if (settingsPanel && settingsPanel.style.display === 'block') {
                    const activeTab = shadow.querySelector('.settings-tab-btn.active');
                    if (activeTab && activeTab.getAttribute('data-tab') === 'tab-system') {
                        renderWatchlistUI();
                    }
                }
            }

            // Фоновый запуск расчета реальных индикаторов
            computePriorityIndicators(isManual);

        } catch (err) {
            if (statusText) {
                statusText.innerHTML = `<span class="live-dot dot-red"></span> <span title="${err.message}">Ошибка Т-Инвестиций</span>`;
            }
            if (err.message && (err.message.includes('401') || err.message.includes('NO_TOKEN') || err.message.includes('Unauthenticated'))) {
                if (tinkoffTokenBadge) {
                    tinkoffTokenBadge.textContent = 'Ошибка токена (401)';
                    tinkoffTokenBadge.style.color = '#f23645';
                }
            }
        } finally {
            if (refreshBtn) refreshBtn.classList.remove('spinning');
        }
    }

    function evaluateTimeframe(tfData, rsiOffset, stochOffset) {
        if (!tfData || tfData.rsi === null || tfData.rsi === undefined || tfData.k === null || tfData.k === undefined) {
            return {
                longBoth: false, longAny: false,
                shortBoth: false, shortAny: false,
                rsiOversold: false, rsiOverbought: false,
                stochOversold: false, stochOverbought: false,
                noData: true
            };
        }

        const rsiLow = rsiOffset;
        const rsiHigh = 100 - rsiOffset;
        const stochLow = stochOffset;
        const stochHigh = 100 - stochOffset;

        const rsiOversold = tfData.rsi <= rsiLow;
        const rsiOverbought = tfData.rsi >= rsiHigh;
        const stochOversold = tfData.k <= stochLow;
        const stochOverbought = tfData.k >= stochHigh;

        const longBoth = rsiOversold && stochOversold;
        const longAny = rsiOversold || stochOversold;
        const shortBoth = rsiOverbought && stochOverbought;
        const shortAny = rsiOverbought || stochOverbought;

        return {
            longBoth,
            longAny,
            shortBoth,
            shortAny,
            rsiOversold,
            rsiOverbought,
            stochOversold,
            stochOverbought,
            noData: false
        };
    }

    function checkAlertsAndCooldown() {
        if (!soundEnabled && !pushEnabled && !tgEnabled) return;

        const rsiOffset = parseFloat(rsiSlider.value);
        const stochOffset = parseFloat(stochSlider.value);
        const now = Date.now();
        const cooldownMs = cooldownMinutes * 60 * 1000;

        const triggeredLongs = [];
        const triggeredShorts = [];

        // Активные ТФ согласно активному фильтру панели (Все ТФ или конкретный ТФ)
        const activeTfs = (currentTfFilter === 'any') ? ['5m', '15m', '1h', '4h'] : [currentTfFilter];

        for (const stock of allStocks) {
            // 1. Фильтр списка акций (Все акции / Избранное / Голубые фишки)
            const isWatched = watchedTickers.has(stock.ticker);
            if (currentListFilter === 'watched_only' && !isWatched) continue;
            if (currentListFilter === 'blue_chips' && !TOP_BLUE_CHIPS.has(stock.ticker)) continue;

            // 2. Фильтры оборота и RVOL (с панели)
            if (minVolumeRub > 0 && stock.turnover < minVolumeRub) continue;
            if (minRvolFilter > 0 && stock.rvol < minRvolFilter) continue;

            const longDetails = [];
            const shortDetails = [];

            activeTfs.forEach(tf => {
                if (!stock.tf || !stock.tf[tf]) return;
                const ev = evaluateTimeframe(stock.tf[tf], rsiOffset, stochOffset);
                if (!ev || ev.noData) return;

                const tfData = stock.tf[tf];
                const rVal = (tfData.rsi !== null && tfData.rsi !== undefined) ? tfData.rsi.toFixed(0) : '—';
                const kVal = (tfData.k !== null && tfData.k !== undefined) ? tfData.k.toFixed(0) : '—';

                let isLong = false;
                let isShort = false;
                let tagLong = '';
                let tagShort = '';

                if (currentIndicatorFilter === 'both') {
                    isLong = ev.longBoth;
                    isShort = ev.shortBoth;
                    tagLong = `RSI+Stoch (${rVal}/${kVal})`;
                    tagShort = `RSI+Stoch (${rVal}/${kVal})`;
                } else if (currentIndicatorFilter === 'any') {
                    isLong = ev.longAny;
                    isShort = ev.shortAny;
                    tagLong = ev.longBoth ? `RSI+Stoch (${rVal}/${kVal})` : (ev.rsiOversold ? `RSI (${rVal})` : `Stoch (${kVal})`);
                    tagShort = ev.shortBoth ? `RSI+Stoch (${rVal}/${kVal})` : (ev.rsiOverbought ? `RSI (${rVal})` : `Stoch (${kVal})`);
                } else if (currentIndicatorFilter === 'rsi_only') {
                    isLong = ev.rsiOversold;
                    isShort = ev.rsiOverbought;
                    tagLong = `RSI (${rVal})`;
                    tagShort = `RSI (${rVal})`;
                } else if (currentIndicatorFilter === 'stoch_only') {
                    isLong = ev.stochOversold;
                    isShort = ev.stochOverbought;
                    tagLong = `Stoch (${kVal})`;
                    tagShort = `Stoch (${kVal})`;
                }

                if (isLong) longDetails.push(`${tf}: ${tagLong}`);
                if (isShort) shortDetails.push(`${tf}: ${tagShort}`);
            });

            // 3. Фильтр направления (учитывает и панель, и настройку alertDirection)
            const allowLong = (currentDirectionFilter !== 'short') && (alertDirection !== 'short_only');
            const allowShort = (currentDirectionFilter !== 'long') && (alertDirection !== 'long_only');

            const hasLong = allowLong && (longDetails.length > 0);
            const hasShort = allowShort && (shortDetails.length > 0);

            if (!hasLong && !hasShort) continue;

            const isClimax = stock.rvol >= climaxRvolThreshold;
            const lastTime = lastAlertTimes[stock.ticker] || 0;

            if (now - lastTime >= cooldownMs) {
                if (hasLong) {
                    lastAlertTimes[stock.ticker] = now;
                    triggeredLongs.push({
                        stock,
                        tfs: longDetails.join('; '),
                        isClimax
                    });
                } else if (hasShort) {
                    lastAlertTimes[stock.ticker] = now;
                    triggeredShorts.push({
                        stock,
                        tfs: shortDetails.join('; '),
                        isClimax
                    });
                }
            }
        }

        const totalTriggers = triggeredLongs.length + triggeredShorts.length;
        if (totalTriggers > 0) {
            saveAlertTimesToStorage();

            const hasClimax = triggeredLongs.some(x => x.isClimax) || triggeredShorts.some(x => x.isClimax);
            const mainDir = triggeredLongs.length >= triggeredShorts.length ? 'long' : 'short';

            if (soundEnabled) playAlertSound(mainDir, hasClimax);

            if (pushEnabled) {
                const parts = [];
                if (triggeredLongs.length > 0) {
                    parts.push(`🟢 LONG (${triggeredLongs.length}): ${triggeredLongs.map(x => x.stock.ticker).slice(0, 3).join(', ')}`);
                }
                if (triggeredShorts.length > 0) {
                    parts.push(`🔴 SHORT (${triggeredShorts.length}): ${triggeredShorts.map(x => x.stock.ticker).slice(0, 3).join(', ')}`);
                }
                sendSystemPushNotification(
                    hasClimax ? '🔥 СИГНАЛЫ MOEX (КУЛЬМИНАЦИЯ)' : '⚡ СИГНАЛЫ MOEX (Live)',
                    `${parts.join('\n')}\n(Пауза ${cooldownMinutes}м)`
                );
            }

            if (tgEnabled) {
                let msg = hasClimax ? `🚨 <b>СИГНАЛЫ MOEX (КУЛЬМИНАЦИЯ ОБЪЕМОВ)</b>\n\n` : `🚨 <b>СИГНАЛЫ MOEX (LIVE)</b>\n\n`;

                if (triggeredLongs.length > 0) {
                    msg += `🟢 <b>ПЕРЕПРОДАННОСТЬ (LONG):</b>\n`;
                    triggeredLongs.slice(0, 5).forEach(item => {
                        const chg = item.stock.change !== null ? (item.stock.change > 0 ? `+${item.stock.change.toFixed(2)}%` : `${item.stock.change.toFixed(2)}%`) : '—';
                        const cTag = item.isClimax ? ` 🔥 <b>RVOL: ${item.stock.rvol.toFixed(1)}x</b>` : ` (RVOL: ${item.stock.rvol.toFixed(1)}x)`;
                        msg += `• <b>${item.stock.ticker}</b> (${item.stock.price} ₽, ${chg})${cTag}\n  ↳ ${item.tfs}\n`;
                    });
                    msg += '\n';
                }

                if (triggeredShorts.length > 0) {
                    msg += `🔴 <b>ПЕРЕКУПЛЕННОСТЬ (SHORT):</b>\n`;
                    triggeredShorts.slice(0, 5).forEach(item => {
                        const chg = item.stock.change !== null ? (item.stock.change > 0 ? `+${item.stock.change.toFixed(2)}%` : `${item.stock.change.toFixed(2)}%`) : '—';
                        const cTag = item.isClimax ? ` 🔥 <b>RVOL: ${item.stock.rvol.toFixed(1)}x</b>` : ` (RVOL: ${item.stock.rvol.toFixed(1)}x)`;
                        msg += `• <b>${item.stock.ticker}</b> (${item.stock.price} ₽, ${chg})${cTag}\n  ↳ ${item.tfs}\n`;
                    });
                }

                msg += `\n⏱ <i>Cooldown: ${cooldownMinutes} мин</i>`;
                sendTelegramAlert(msg);
            }
        }
    }

    function formatCell(tfData, evalRes) {
        if (!tfData || tfData.rsi === null || tfData.rsi === undefined) {
            return `<td style="color: #434651;">—</td>`;
        }
        const r = tfData.rsi.toFixed(1);
        const k = tfData.k !== null && tfData.k !== undefined ? tfData.k.toFixed(1) : '—';

        let cls = '';
        if (evalRes.longBoth) cls = 'signal-both-long';
        else if (evalRes.shortBoth) cls = 'signal-both-short';
        else if (evalRes.longAny) cls = 'signal-one-long';
        else if (evalRes.shortAny) cls = 'signal-one-short';

        const dTip = (tfData.d !== null && tfData.d !== undefined) ? ` (%D: ${tfData.d.toFixed(1)})` : '';
        return `<td class="${cls}" title="RSI: ${r} | Slow %K (SMA 3): ${k}${dTip}">${r} | ${k}</td>`;
    }

    function formatPriceChange(price, change, turnover) {
        const priceStr = (price !== null && price !== undefined) ? `${price} ₽` : '—';
        let volStr = '';
        if (turnover > 1000000000) volStr = `${(turnover / 1000000000).toFixed(1)}B ₽`;
        else if (turnover > 1000000) volStr = `${(turnover / 1000000).toFixed(1)}M ₽`;

        if (change === null || change === undefined) {
            return `<td><div><b>${priceStr}</b></div><span class="chg-zero">—</span></td>`;
        }
        const sign = change > 0 ? '+' : '';
        const cls = change > 0 ? 'chg-pos' : (change < 0 ? 'chg-neg' : 'chg-zero');
        return `<td><div><b>${priceStr}</b></div><span class="${cls}">${sign}${change.toFixed(2)}%</span> <small style="color:#787b86;">${volStr}</small></td>`;
    }

    function formatRvolBadge(rvol) {
        if (rvol === null || rvol === undefined) return `<td>—</td>`;
        const valStr = `${rvol.toFixed(1)}x`;
        const rDays = (config.indicators && config.indicators.rvolDays) || 10;
        if (rvol >= climaxRvolThreshold) {
            return `<td><span class="badge-spike" title="Всплеск объема: в ${valStr} выше средней нормы (${rDays} дн)">${valStr}</span></td>`;
        } else if (rvol >= 1.5) {
            return `<td><span class="badge-rvol-active" title="Повышенный объем (${rDays} дн)">${valStr}</span></td>`;
        }
        return `<td style="color:#787b86;">${valStr}</td>`;
    }

    function renderTable() {
        if (isDragging || isResizing) {
            needsRenderAfterDrag = true;
            return;
        }
        if (!tinkoffToken) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding: 42px 20px; text-align: center;">
                        <div style="font-size: 34px; margin-bottom: 12px;">🔑</div>
                        <div style="font-size: 15px; font-weight: 600; color: #d1d4dc; margin-bottom: 8px;">
                            Требуется токен Т-Инвестиций
                        </div>
                        <div style="font-size: 12px; color: #787b86; max-width: 440px; margin: 0 auto 16px; line-height: 1.5;">
                            Для получения реалтайм котировок MOEX без задержки и расчета индикаторов укажите ваш токен Т-Инвестиций с правами «Только чтение» в настройках.
                        </div>
                        <button id="no-token-open-settings-btn" style="background: #2962ff; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            ⚙️ Ввести токен в настройках
                        </button>
                    </td>
                </tr>
            `;
            const openBtn = shadow.getElementById('no-token-open-settings-btn');
            if (openBtn) {
                openBtn.addEventListener('click', () => {
                    settingsPanel.style.display = 'block';
                    shadow.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'tab-alerts'));
                    shadow.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-alerts'));
                    if (tinkoffTokenInput) tinkoffTokenInput.focus();
                });
            }
            renderFooterBar();
            return;
        }

        updateSortArrows();

        const rsiOffset = parseFloat(rsiSlider.value);
        const stochOffset = parseFloat(stochSlider.value);
        const selectedTf = currentTfFilter;
        const now = Date.now();
        const cooldownMs = cooldownMinutes * 60 * 1000;
        const filtered = [];

        for (const stock of allStocks) {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const tickerMatch = stock.ticker.toLowerCase().includes(q);
                const descMatch = stock.description && stock.description.toLowerCase().includes(q);
                if (!tickerMatch && !descMatch) continue;
            }

            const isWatched = watchedTickers.has(stock.ticker);
            if (currentListFilter === 'watched_only' && !isWatched) continue;
            if (currentListFilter === 'blue_chips' && !TOP_BLUE_CHIPS.has(stock.ticker)) continue;
            if (minVolumeRub > 0 && stock.turnover < minVolumeRub) continue;
            if (minRvolFilter > 0 && stock.rvol < minRvolFilter) continue;

            const e5 = evaluateTimeframe(stock.tf['5m'], rsiOffset, stochOffset);
            const e15 = evaluateTimeframe(stock.tf['15m'], rsiOffset, stochOffset);
            const e1h = evaluateTimeframe(stock.tf['1h'], rsiOffset, stochOffset);
            const e4h = evaluateTimeframe(stock.tf['4h'], rsiOffset, stochOffset);
            const allNoData = e5.noData && e15.noData && e1h.noData && e4h.noData;

            // Выборка таймфреймов для фильтрации
            const targetTfs = (selectedTf === 'any') ? ['5m', '15m', '1h', '4h'] : [selectedTf];
            const targetEvals = targetTfs.map(tf => tf === '5m' ? e5 : tf === '15m' ? e15 : tf === '1h' ? e1h : e4h);

            // Проверка сигналов с учетом выбранного режима индикаторов
            let hasLong = false;
            let hasShort = false;

            for (const ev of targetEvals) {
                if (!ev || ev.noData) continue;
                let l = false;
                let s = false;
                if (currentIndicatorFilter === 'both') {
                    l = ev.longBoth;
                    s = ev.shortBoth;
                } else if (currentIndicatorFilter === 'any') {
                    l = ev.longAny;
                    s = ev.shortAny;
                } else if (currentIndicatorFilter === 'rsi_only') {
                    l = ev.rsiOversold;
                    s = ev.rsiOverbought;
                } else if (currentIndicatorFilter === 'stoch_only') {
                    l = ev.stochOversold;
                    s = ev.stochOverbought;
                }
                if (l) hasLong = true;
                if (s) hasShort = true;
            }

            // Фильтрация по направлению (Тип)
            if (currentDirectionFilter === 'signals' && !hasLong && !hasShort) continue;
            if (currentDirectionFilter === 'long' && !hasLong) continue;
            if (currentDirectionFilter === 'short' && !hasShort) continue;

            const isClimaxLong = hasLong && (stock.rvol >= climaxRvolThreshold);
            const isClimaxShort = hasShort && (stock.rvol >= climaxRvolThreshold);
            const isClimax = isClimaxLong || isClimaxShort;

            let statusRank = 1;
            if (allNoData) statusRank = 0;
            else if (isClimax) statusRank = 5;
            else if (hasLong || hasShort) statusRank = 4;

            filtered.push({
                stock, isWatched, e5, e15, e1h, e4h,
                hasLong, hasShort,
                isClimaxLong, isClimaxShort, allNoData, statusRank
            });
        }

        filtered.sort((a, b) => {
            let valA, valB;
            if (sortField === 'ticker') {
                return sortAsc ? a.stock.ticker.localeCompare(b.stock.ticker) : b.stock.ticker.localeCompare(a.stock.ticker);
            } else if (sortField === 'change') {
                valA = a.stock.change; valB = b.stock.change;
            } else if (sortField === 'rvol') {
                valA = a.stock.rvol; valB = b.stock.rvol;
            } else if (sortField === '5m' || sortField === '15m' || sortField === '1h' || sortField === '4h') {
                valA = a.stock.tf[sortField] ? a.stock.tf[sortField].rsi : null;
                valB = b.stock.tf[sortField] ? b.stock.tf[sortField].rsi : null;
            } else if (sortField === 'status') {
                valA = a.statusRank; valB = b.statusRank;
            }

            const aNull = (valA === null || valA === undefined);
            const bNull = (valB === null || valB === undefined);
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;

            return sortAsc ? (valA - valB) : (valB - valA);
        });

        const prevScroll = tableContainer.scrollTop;

        if (filtered.length === 0) {
            const noMatchMsg = searchQuery
                ? `По запросу «${searchQuery}» ничего не найдено.`
                : 'Нет бумаг по выбранному фильтру. Проверьте настройки фильтров.';
            tbody.innerHTML = `<tr><td colspan="8" style="padding:18px; color:#787b86; text-align:center;">${noMatchMsg}</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            const { stock, isWatched, e5, e15, e1h, e4h, hasLong, hasShort, isClimaxLong, isClimaxShort, allNoData } = item;
            const starCls = isWatched ? 'star-btn starred' : 'star-btn';
            const starChar = isWatched ? '★' : '☆';

            const lastAlert = lastAlertTimes[stock.ticker] || 0;
            const onCooldown = (now - lastAlert) < cooldownMs;
            const cooldownLeft = onCooldown ? Math.ceil((cooldownMs - (now - lastAlert)) / 60000) : 0;
            const cdIcon = onCooldown ? `<span class="cooldown-dot" title="Антиспам Cooldown: тишина еще ${cooldownLeft} мин">⏳${cooldownLeft}м</span>` : '';

            let statusBadge = '<span class="badge-norm">Норма</span>';
            if (allNoData) {
                const dRsi = stock.dailyRsi !== null && stock.dailyRsi !== undefined ? `1D RSI: ${stock.dailyRsi.toFixed(1)}` : 'Выходной';
                statusBadge = `<span class="badge-nodata">${dRsi}</span>`;
            } else if (isClimaxLong) {
                statusBadge = '<span class="badge-climax-long" title="Капитуляция: Перепроданность + Всплеск объема!">КАПИТУЛЯЦИЯ</span>';
            } else if (isClimaxShort) {
                statusBadge = '<span class="badge-climax-short" title="Эйфория: Перекупленность + Всплеск объема!">ЭЙФОРИЯ</span>';
            } else if (hasLong && hasShort) {
                statusBadge = '<span class="badge-strong-long">СИГНАЛ (ОБА)</span>';
            } else if (hasLong) {
                statusBadge = '<span class="badge-strong-long">LONG</span>';
            } else if (hasShort) {
                statusBadge = '<span class="badge-strong-short">SHORT</span>';
            }

            const isActiveRow = currentActiveTerminalTicker && (stock.ticker === currentActiveTerminalTicker);
            const trClass = isActiveRow ? 'row-active-ticker' : '';

            return `
                <tr class="${trClass}" data-ticker="${stock.ticker}">
                    <td style="text-align:left;">
                        <span class="${starCls}" data-star="${stock.ticker}" title="В избранное">${starChar}</span>
                        <span class="ticker-link" data-ticker="${stock.ticker}" data-symbol="${stock.fullSymbol}" title="Открыть ${stock.ticker} (Клик: в терминале, Ctrl+клик: новая вкладка)">${stock.ticker}</span>${cdIcon}
                        <span class="sub-name">${stock.description}</span>
                    </td>
                    ${formatPriceChange(stock.price, stock.change, stock.turnover)}
                    ${formatRvolBadge(stock.rvol)}
                    ${formatCell(stock.tf['5m'], e5)}
                    ${formatCell(stock.tf['15m'], e15)}
                    ${formatCell(stock.tf['1h'], e1h)}
                    ${formatCell(stock.tf['4h'], e4h)}
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

        tableContainer.scrollTop = prevScroll;
        renderFooterBar();
    }

    function restartTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        if (isPaused) return;
        const ms = parseInt(intervalSelect.value, 10) || 15000;
        timerId = setInterval(fetchAllMoexStocks, ms);
    }

    // ==========================================
    // ЭТАП 2: РЕАКТИВНАЯ КРОСС-ВКЛАДОЧНАЯ СИНХРОНИЗАЦИЯ
    // ==========================================
    function syncUIFromRemote() {
        const c = ConfigStore.data;

        // 1. Избранное
        watchedTickers = new Set(c.favorites || []);
        if (wlCountLabel) wlCountLabel.textContent = `В списке: ${watchedTickers.size}`;

        // 2. Оповещения
        soundEnabled = !!c.alerts.sound;
        pushEnabled = !!c.alerts.push;
        tgEnabled = !!c.alerts.telegram;
        tgToken = c.alerts.tgToken || '';
        tgChatId = c.alerts.tgChatId || '';
        cooldownMinutes = c.alerts.cooldownMins || 15;
        alertDirection = c.alerts.direction || 'both';
        climaxRvolThreshold = c.thresholds.climaxRvol || 2.0;

        if (tgTokenInput) tgTokenInput.value = tgToken;
        if (tgChatInput) tgChatInput.value = tgChatId;
        if (cooldownSelect) cooldownSelect.value = String(cooldownMinutes);
        if (alertDirectionSelect) alertDirectionSelect.value = alertDirection;
        if (climaxRvolSelect) climaxRvolSelect.value = String(climaxRvolThreshold);
        updateToggleButtonsUI();

        // 3. Пороги и периоды индикаторов
        if (rsiSlider) rsiSlider.value = String(c.thresholds.rsi || 30);
        if (stochSlider) stochSlider.value = String(c.thresholds.stoch || 20);
        if (c.indicators) {
            if (rsiPeriodSlider) rsiPeriodSlider.value = String(c.indicators.rsiPeriod || 14);
            if (stochPeriodSlider) stochPeriodSlider.value = String(c.indicators.stochPeriod || 14);
            if (rvolDaysSlider) rvolDaysSlider.value = String(c.indicators.rvolDays || 10);
        }
        updateSliderLabels();

        // 4. Фильтры
        currentListFilter = c.filters.listFilter || 'all_stocks';
        updateListFilterUI(currentListFilter, false);
        currentDirectionFilter = c.filters.direction || 'all';
        updateDirectionFilterUI(currentDirectionFilter, false);
        currentIndicatorFilter = c.filters.indicatorMode || 'both';
        updateIndicatorFilterUI(currentIndicatorFilter, false);
        minRvolFilter = c.filters.minRvolFilter || 0;
        updateRvolFilterUI(minRvolFilter, false);
        currentTfFilter = c.filters.tf || 'any';
        updateTfFilterUI(currentTfFilter, false);
        if (tfSelect) tfSelect.value = currentTfFilter;
        minVolumeRub = c.filters.minVolumeRub || 0;
        if (volumeFilterSelect) volumeFilterSelect.value = String(minVolumeRub);
        sortField = c.filters.sortField || 'change';
        sortAsc = !!c.filters.sortAsc;
        updateSortArrows();

        // 5. Сеть и API
        openInNewTab = !!c.network.openInNewTab;
        if (openModeSelect) openModeSelect.value = openInNewTab ? 'new_tab' : 'terminal';
        tinkoffToken = (c.network && c.network.tinkoffToken) || '';
        updateTinkoffUI();
        if (intervalSelect) {
            const newInterval = String(c.network.refreshIntervalMs || 15000);
            if (intervalSelect.value !== newInterval) {
                intervalSelect.value = newInterval;
                restartTimer();
            }
        }
        if (c.network && typeof c.network.isPaused === 'boolean') {
            if (isPaused !== c.network.isPaused) {
                isPaused = c.network.isPaused;
                if (isPaused) {
                    if (timerId) { clearInterval(timerId); timerId = null; }
                } else {
                    restartTimer();
                }
                updateStatusUI();
            }
        }

        // 6. Отрисовка
        renderTable();
        renderFooterBar();
        if (settingsPanel && settingsPanel.style.display !== 'none') {
            const activeTab = shadow.querySelector('.settings-tab-pane.active');
            if (activeTab && activeTab.id === 'tab-system') {
                renderWatchlistUI();
            }
        }
    }

    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener('moex_config_v11', (name, oldVal, newVal, remote) => {
            if (remote && newVal && typeof newVal === 'object') {
                ConfigStore.data = deepMerge(DEFAULT_CONFIG, newVal);
                syncUIFromRemote();
            }
        });

        GM_addValueChangeListener('moex_alert_times', (name, oldVal, newVal, remote) => {
            if (remote && newVal) {
                try {
                    lastAlertTimes = JSON.parse(newVal);
                    renderTable();
                } catch (e) {}
            }
        });
    }

    // ==========================================
    // ОПТИМИЗАЦИЯ: МГНОВЕННЫЙ СТАРТ ИЗ КЭША (0 мс)
    // ==========================================
    try {
        const cached = GM_getValue('moex_quotes_cache', null);
        if (cached && Array.isArray(cached.stocks) && cached.stocks.length > 0) {
            const ageMinutes = Math.round((Date.now() - (cached.timestamp || 0)) / 60000);
            if (ageMinutes < 180) { // кэш моложе 3 часов
                allStocks = cached.stocks;
                const timeStr = ageMinutes > 0 ? `${ageMinutes} мин назад` : 'только что';
                lastUpdateTime = timeStr;
                if (!isPaused) {
                    statusText.innerHTML = `<span class="live-dot dot-yellow"></span> <span>Кэш (${timeStr})</span>`;
                    statusText.title = `Данные загружены из кэша. Идет фоновое обновление с Т-Инвестиций...`;
                }
                renderTable();
            }
        }
    } catch (e) {}

    // Слушатель активности вкладки (Page Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && allStocks.length > 0) {
            renderTable();
            renderFooterBar();
        }
    });

    // ==========================================
    // ИНТЕГРАЦИЯ КНОПКИ «СКРИНЕР» В ШАПКУ Т-ТЕРМИНАЛА
    // ==========================================
    function setupTerminalHeaderButton() {
        function injectButton() {
            const legacyBtn = document.getElementById('tbank-screener-toggle-btn');
            if (legacyBtn) legacyBtn.remove();

            if (document.getElementById('tbank-moex-screener-btn')) {
                updateTerminalHeaderButtonState();
                return;
            }

            const addWidgetBtn = document.getElementById('addWidgetMenuButton') ||
                                 document.querySelector('[data-qa-icon="add-widget2"]')?.closest('button') ||
                                 document.querySelector('[class*="addWidgetMenu"] button');

            if (!addWidgetBtn || !addWidgetBtn.parentNode) return;

            const screenerBtn = document.createElement('button');
            screenerBtn.id = 'tbank-moex-screener-btn';
            screenerBtn.type = 'button';

            let btnClass = addWidgetBtn.className.replace(/\bpx-\d+\b/g, '');
            if (!btnClass.includes('button-icon')) {
                btnClass += ' packages-kit-src-components-Button-Button-button-icon-a26ee';
            }
            screenerBtn.className = btnClass;
            screenerBtn.style.padding = '0';
            screenerBtn.style.aspectRatio = '1 / 1';
            screenerBtn.style.display = 'inline-flex';
            screenerBtn.style.alignItems = 'center';
            screenerBtn.style.justifyContent = 'center';
            screenerBtn.title = 'Скринер MOEX';

            const containerEl = addWidgetBtn.querySelector('div');
            const containerClass = containerEl ? containerEl.className : '';
            const iconWrapEl = addWidgetBtn.querySelector('[data-qa-type="kit/Icon"]');
            const iconWrapClass = iconWrapEl ? iconWrapEl.className : '';
            const cleanIconWrapClass = (iconWrapClass || '')
                .replace(/packages-kit-src-components-Button-Button-leftIcon-[a-z0-9]+/g, '')
                .replace(/packages-kit-src-components-Button-Button-obsoleteIconMargin-[a-z0-9]+/g, '')
                .trim();

            screenerBtn.innerHTML = `
                <div class="${containerClass}" style="display: flex; align-items: center; justify-content: center;">
                    <span style="width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; margin: 0;" class="${cleanIconWrapClass}" role="img" aria-hidden="true">
                        <span size="16" class="pro-icon" style="display: inline-flex; align-items: center; justify-content: center;">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3ZM3.5 3.5V6H6.5V3.5H3.5ZM8 3.5V6H12.5V3.5H8ZM12.5 7.5H8V10H12.5V7.5ZM12.5 11.5H8V12.5H12.5V11.5ZM6.5 12.5V11.5H3.5V12.5H6.5ZM3.5 10H6.5V7.5H3.5V10Z" fill="currentColor"></path>
                            </svg>
                        </span>
                    </span>
                </div>
            `;

            screenerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleScreenerVisibility();
            });

            addWidgetBtn.parentNode.insertBefore(screenerBtn, addWidgetBtn);
            updateTerminalHeaderButtonState();
        }

        injectButton();

        const observer = new MutationObserver(() => {
            if (!document.getElementById('tbank-moex-screener-btn')) {
                injectButton();
            }
        });

        try {
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}

        setInterval(() => {
            if (!document.getElementById('tbank-moex-screener-btn')) {
                injectButton();
            }
        }, 2000);
    }

    if (isPaused) {
        updateStatusUI();
    } else {
        setTimeout(fetchAllMoexStocks, 150);
        restartTimer();
    }
    startFooterRotation();
    injectFiberBridge();
    setupTerminalHeaderButton();
})();
