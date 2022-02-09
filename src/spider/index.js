'use strict';

var browser = require('browser-x');
var utils = require('./utils');
var Adapter = require('../adapter');
var WebFont = require('./web-font');
var concat = require('./concat');
var colors = require('colors/safe');
var defaultFSInfo = utils.defaultFSInfo;
var fontStyleOrder = utils.fontStyleOrder;

// 遍历文档树，将字体属性下推至所有继承节点，将内容添加至匹配的WebFonts的char属性中
function dfsDocument(element, haveFontStyle, inheritedInfo, webFonts) {
    var fsInfo;
    if (element._fontSpiderInfo) {
        inheritedInfo = {
            'font-family': element._fontSpiderInfo['font-family'].length > 0 ? element._fontSpiderInfo['font-family'] : inheritedInfo['font-family'],
            'font-style': element._fontSpiderInfo['font-style'] || inheritedInfo['font-style'],
            'font-weight': element._fontSpiderInfo['font-weight'] || inheritedInfo['font-weight']
        };
        haveFontStyle = true;
    }
    if (element.pseudoNode) {
        dfsDocument(element.pseudoNode, haveFontStyle, inheritedInfo, webFonts);
    }
    var defInfo;
    if (element.nodeName) {
        defInfo = defaultFSInfo[element.nodeName.toLowerCase()] || defaultFSInfo.default;
    } else {
        defInfo = defaultFSInfo.default;
    }
    fsInfo = {
        'font-family': inheritedInfo['font-family'].length > 0 ? inheritedInfo['font-family'] : defInfo['font-family'],
        'font-style': inheritedInfo['font-style'] || defInfo['font-style'],
        'font-weight': inheritedInfo['font-weight'] || defInfo['font-weight']
    };
    // console.log(element.nodeName);
    if (element.nodeName && haveFontStyle) {
        var content = element.textContent;

        // @see https://github.com/aui/font-spider/issues/99
        if (!content && (element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA')) {
            // TODO element.getAttribute('value')
            content = element.getAttribute('placeholder');
        }

        content += content.toLowerCase();
        content += content.toUpperCase();

        // 处理 fallback，按照 family 第一关键字, style 第二关键字, weight 第三关键字的顺序对 webFonts 进行排序
        // 最靠前者若可匹配字体，则获得 fallback 资格
        webFonts.sort(function(a, b) {
            if (fsInfo['font-family'].indexOf('"' + a.family + '"') === -1 || fsInfo['font-family'].indexOf('"' + b.family + '"') === -1) {
                // 必有一个为 -1，另一个一定比它大；若同时为 -1 都无法匹配，返回相等即可
                return fsInfo['font-family'].indexOf('"' + b.family + '"') - fsInfo['font-family'].indexOf('"' + a.family + '"');
            }
            // family 都有匹配，比较 style
            // style顺序：
            //  - fsInfo['font-style'] === 'normal', 则为 normal < italic == oblique
            //  - fsInfo['font-style'] === 'italic', 则为 italic < oblique < normal
            //  - fsInfo['font-style'] === 'oblique', 则为 oblique < italic < normal
            if (fontStyleOrder[fsInfo['font-style']][a.style] !== fontStyleOrder[fsInfo['font-style']][b.style]) {
                return fontStyleOrder[fsInfo['font-style']][a.style] - fontStyleOrder[fsInfo['font-style']][b.style];
            }
            // style 顺序相当，比较 weight
            // 规则详见：https://developer.mozilla.org/zh-CN/docs/Web/CSS/font-weight#回退机制
            var aw = WebFont.getFontWeight(a.weight);
            var bw = WebFont.getFontWeight(b.weight);
            var ew = WebFont.getFontWeight(fsInfo['font-weight']);
            if (400 <= ew && ew <= 500) {
                if (ew == aw) aw = 3300;
                else if (ew <= aw && aw <= 500) aw = aw - ew + 2200;
                else if (aw < ew) aw = ew - aw + 1100;
                else aw = aw - ew;
                if (ew == bw) bw = 3300;
                else if (ew <= bw && bw <= 500) bw = bw - ew + 2200;
                else if (bw < ew) bw = ew - bw + 1100;
                else bw = bw - ew;
            } else if (ew < 400) {
                if (ew == aw) aw = 3300;
                else if (aw <= ew) aw = ew - aw + 1100;
                else aw = aw - ew;
                if (ew == bw) bw = 3300;
                else if (bw <= ew) bw = ew - bw + 1100;
                else bw = bw - ew;
            } else if (ew > 500) {
                if (ew == aw) aw = 3300;
                else if (aw >= ew) aw = aw - ew + 1100;
                else aw = ew - aw;
                if (ew == bw) bw = 3300;
                else if (bw >= ew) bw = bw - ew + 1100;
                else bw = ew - bw;
            }
            return bw - aw;
        });

        var vis = {}

        webFonts.forEach(function(webFont) {
            if (vis[webFont.family]) return;
            if (webFont.matchFSInfo(fsInfo)) {
                webFont.addChar(content);
                vis[webFont.family] = true;
            }
        });

    }
    if (element.childNodes) {
        for (var i = 0; i < element.childNodes.length; ++i) {
            dfsDocument(element.childNodes[i], haveFontStyle, inheritedInfo, webFonts);
        }
    }
}


/**
 * 蜘蛛类
 * @param   {Window}            浏览器全局对象 @see browser-x
 * @param   {Boolean}           是否开启 debug 模式
 * @return  {Array<WebFont>}    WebFont 描述信息 @see ./web-font.js
 */
function FontSpider(window, debug) {
    this.window = window;
    this.document = window.document;
    this.debug = debug;

    if (debug) {
        this.debugInfo({
            url: window.document.URL
        });
    }

    return this.parse();
}

FontSpider.prototype = {

    constructor: FontSpider,
    window: null,
    document: null,



    /**
     * parser
     * @return  {Array<WebFont>}
     */
    parse: function() {
        var that = this;
        var webFonts = this.getWebFonts();


        if (!webFonts.length) {
            return webFonts;
        }


        var cssStyleRules = this.getCssStyleRules();
        var pseudoCssStyleRules = [];
        var pseudoSelector = /\:\:?(?:before|after)$/i;
        var inlineStyleSelectors = 'body[style*="font"], body [style*="font"]';

        // 将字体信息写入选择器选择的所有节点
        cssStyleRules.forEach(function(cssStyleRule) {
            var style = cssStyleRule.style;
            var selectors = cssStyleRule.selectorText;
            if (WebFont.haveFontStyle(style)) {
                that.getSelectors(selectors).forEach(function(selector) {
                    if (pseudoSelector.test(selector)) {
                        if (style.content) {
                            that.getElements(selector, true).forEach(function(element) {
                                var pseudoNode = {}
                                if (utils.cssContentParser(style.content)[0]) {
                                    pseudoNode.textContent = utils.cssContentParser(style.content)[0].value;
                                } else {
                                    pseudoNode.textContent = '';
                                }
                                pseudoNode.ispseudo = true;
                                pseudoNode.nodeName = '#';
                                pseudoNode._fontSpiderInfo = {
                                    'font-family': WebFont.getComputedFontFamilys(style),
                                    'font-style': WebFont.getComputedFontStyle(style),
                                    'font-weight': WebFont.getComputedFontWeight(style)
                                }
                                element.pseudoNode = pseudoNode;
                            });
                        }
                    }
                    that.getElements(selector, true).forEach(function(element) {
                        var oldInfo = element._fontSpiderInfo;
                        // if (element.id == 'main-nav-toggle') {
                        //     console.log(element._fontSpiderInfo);
                        // }
                        if (oldInfo) {
                            var new_family = WebFont.getComputedFontFamilys(style);
                            element._fontSpiderInfo = {
                                'font-family': new_family.length > 0 ? new_family : oldInfo['font-family'],
                                'font-style': WebFont.getComputedFontStyle(style) || oldInfo['font-style'],
                                'font-weight': WebFont.getComputedFontWeight(style) || oldInfo['font-weight']
                            };
                        } else {
                            element._fontSpiderInfo = {
                                'font-family': WebFont.getComputedFontFamilys(style),
                                'font-style': WebFont.getComputedFontStyle(style),
                                'font-weight': WebFont.getComputedFontWeight(style)
                            };
                        }
                    });
                    
                });
            }
        });


        // 行内样式
        this.getSelectors(inlineStyleSelectors).forEach(function(selector) {
            that.getElements(selector).forEach(function(element) {
                var style = element.style;
                if (WebFont.haveFontStyle(style)) {
                    var oldInfo = element._fontSpiderInfo;
                    if (oldInfo) {
                        var new_family = WebFont.getComputedFontFamilys(style);
                        element._fontSpiderInfo = {
                            'font-family': new_family.length > 0 ? new_family : oldInfo['font-family'],
                            'font-style': WebFont.getComputedFontStyle(style) || oldInfo['font-style'],
                            'font-weight': WebFont.getComputedFontWeight(style) || oldInfo['font-weight']
                        };
                    } else {
                        element._fontSpiderInfo = {
                            'font-family': WebFont.getComputedFontFamilys(style),
                            'font-style': WebFont.getComputedFontStyle(style),
                            'font-weight': WebFont.getComputedFontWeight(style)
                        };
                    }
                }
            });
        });


        // 遍历文档树，将字体属性下推至所有继承节点，将内容添加至匹配的WebFonts的char属性中
        dfsDocument(this.document, false, {
            'font-family': [],
            'font-style': '',
            'font-weight': ''
        }, webFonts)


        pseudoCssStyleRules = null;

        webFonts = webFonts.map(function(webFont) {
            return webFont.toData();
        });

        // 忽略内联的base64字体
        webFonts = webFonts.filter(function (webFont) {
            return webFont.files.every(function (file) {
                return !/^data:/.test(file.url);
            })
        })

        return webFonts;
    },



    /**
     * 解析伪元素 content 属性值
     * 仅支持 `content: 'prefix'` 和 `content: attr(value)` 这两种或组合的形式
     * @see https://developer.mozilla.org/zh-CN/docs/Web/CSS/content
     * @param   {String}
     * @param   {String}
     * @return  {String}
     */
    getContent: function(selector, content) {

        var string = '';
        var tokens = [];

        try {
            tokens = utils.cssContentParser(content);
        } catch (e) {}

        tokens.map(function(token) {
            if (token.type === 'string') {
                string += token.value;
            } else if (token.type === 'attr') {
                var elements = this.getElements(selector, true);
                var index = -1;
                var length = elements.length;
                while (++index < length) {
                    string += elements[index].getAttribute(token.value) || '';
                }
            }
        }, this);

        return string;
    },



    /**
     * 根据选择器查找元素，支持伪类和伪元素
     * @param   {String}            选择器
     * @param   {Boolean}           是否支持伪元素
     * @return  {Array<Element>}    元素列表
     */
    getElements: function(selector, matchPseudoParent) {
        var document = this.document;
        var RE_DPSEUDOS = /\:(link|visited|target|active|focus|hover|checked|disabled|enabled|selected|lang\(([-\w]{2,})\)|not\(([^()]*|.*)\))?(.*)/i;
        var elements = [];

        // 伪类
        selector = selector.replace(RE_DPSEUDOS, '');

        // 伪元素
        if (matchPseudoParent) {
            // .selector ::after
            // ::after
            selector = selector.replace(/\:\:?(?:before|after)$/i, '') || '*';
        }


        try {
            elements = document.querySelectorAll(selector);
            elements = Array.prototype.slice.call(elements);
        } catch (e) {}

        return elements;
    },



    /**
     * 获取选择器列表
     * @param   {String}
     * @return  {Array<String>}
     */
    getSelectors: function(selector) {
        return utils.split(selector).map(function(selector) {
            return selector.trim();
        });
    },



    /**
     * 获取 WebFonts
     * @param   {Array<WebFont>}
     */
    getWebFonts: function() {
        var window = this.window;
        var CSSFontFaceRule = window.CSSFontFaceRule;
        var webFonts = [];
        this.eachCssRuleList(function(cssRule) {
            if (cssRule instanceof CSSFontFaceRule) {
                var webFont = WebFont.parse(cssRule);
                if (webFont) {
                    webFonts.push(webFont);
                }
            }
        });

        return webFonts;
    },



    /**
     * @return {Array<CSSStyleRule>}
     */
    getCssStyleRules: function() {

        var window = this.window;
        var CSSStyleRule = window.CSSStyleRule;
        var cssStyleRules = [];

        this.eachCssRuleList(function(cssRule) {
            if (cssRule instanceof CSSStyleRule) {
                cssStyleRules.push(cssRule);
            }
        });

        return cssStyleRules;
    },



    /**
     * 遍历每一条规则
     * @param   {Function}
     */
    eachCssRuleList: function(callback) {

        var window = this.window;
        var document = window.document;
        var CSSImportRule = window.CSSImportRule;
        var CSSMediaRule = window.CSSMediaRule;


        var index = -1;
        var styleSheetList = document.styleSheets;
        var length = styleSheetList.length;
        var cssStyleSheet, cssRuleList;

        while (++index < length) {
            cssStyleSheet = styleSheetList[index];
            cssRuleList = cssStyleSheet.cssRules || [];
            cssRuleListFor(cssRuleList, callback);
        }


        function cssRuleListFor(cssRuleList, callback) {
            var index = -1;
            var length = cssRuleList.length;
            var cssRule, cssStyleSheet;

            while (++index < length) {
                cssRule = cssRuleList[index];

                if (cssRule instanceof CSSImportRule) {
                    cssStyleSheet = cssRule.styleSheet;
                    cssRuleListFor(cssStyleSheet.cssRules || [], callback);
                } else if (cssRule instanceof CSSMediaRule) {
                    cssRuleListFor(cssRule.cssRules || [], callback);
                } else {
                    callback(cssRule);
                }
            }
        }
    },



    /**
     * 显示调试信息
     * @param   {Object}
     */
    debugInfo: function(message) {
        console.log(
            colors.bgYellow('DEBUG'),
            '{',
            Object.keys(message).map(function(key) {
                var value = message[key];
                return JSON.stringify(key) + ': ' + colors.green(JSON.stringify(value));
            }).join(', '),
            '}'
        );
    }

};



/**
 * 查找页面所使用的字体，得到 WebFonts 描述信息 @see ./web-font.js
 * @param   {Array<String>}     网页路径列表
 * @param   {Adapter}           选项
 * @param   {Function}          回调函数
 * @return  {Promise}           如果没有 `callback` 参数则返回 `Promise` 对象
 */
module.exports = function(htmlFiles, adapter, callback) {
    adapter = new Adapter(adapter);

    if (!Array.isArray(htmlFiles)) {
        htmlFiles = [htmlFiles];
    }

    var webFonts = Promise.all(htmlFiles.map(function(htmlFile) {
        var options = Object.create(adapter);

        if (typeof htmlFile === 'string') {
            options.url = htmlFile;

        } else if (htmlFile.path && htmlFile.contents) {
            // 支持 gulp
            options.url = htmlFile.path;
            options.html = htmlFile.contents.toString();
        }

        return browser(options).then(function(window) {
            return new FontSpider(window, adapter.debug);
        });
    })).then(function(list) {

        // 合并字体、字符除重、字符排序、路径忽略、路径映射
        return concat(list, adapter);
    });



    if (typeof callback === 'function') {
        webFonts.then(function(webFonts) {
            process.nextTick(function() {
                callback(null, webFonts);
            });
            return webFonts;
        }).catch(function(errors) {
            process.nextTick(function() {
                callback(errors);
            });
            return Promise.reject(errors);
        });
    } else {
        return webFonts;
    }

};