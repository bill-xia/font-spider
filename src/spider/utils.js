'use strict';

/**
 * 按逗号分割字符串（引号包裹的逗号不参与分割）
 * @param   {String}
 * @return  {Array<String>}
 */
function split(input) {

    var current = 0;
    var array = [];
    var length = input.length;
    var char, value, quotation;
    var SPLIT = /,/;
    var STRING = /["']/;

    while (current < length) {

        char = input.charAt(current);

        // 分割符
        if (SPLIT.test(char)) {
            add('', true);
            current++;
            continue;
        }

        // 字符串
        if (STRING.test(char)) {
            quotation = char;
            value = quotation;

            while (current < length) {
                char = input.charAt(++current);
                value += char;

                if (char === '\\') {
                    value += input.charAt(++current);
                    continue;
                }

                if (char === quotation) {
                    break;
                }
            }

            add(value);
            current++;
            continue;
        }

        // 其他
        add(char);
        current++;
    }


    function add(char, split) {
        if (split || array.length === 0) {
            array.push('');
        }
        array[array.length - 1] += char;
    }

    return array;
}



/**
 * 解析伪元素 content 值
 * 仅支持 `content: 'prefix'` 和 `content: attr(value)` 这两种或组合的形式
 * @see https://developer.mozilla.org/zh-CN/docs/Web/CSS/content
 * @param   {String}    content value
 * @return  {Array}     AST
 */
function cssContentParser(input) {

    var tokens = tokenizer(input);

    var ret = [];
    var length = tokens.length;
    var current = 0;
    var token, open, close;

    while (current < length) {
        token = tokens[current];

        if (token.type === 'string') {
            ret.push({
                type: 'string',
                value: parseString(token.value)
            });
            current++;
            continue;
        }

        if (token.type === 'word' && /^attr$/i.test(token.value)) {

            open = tokens[current + 1];
            token = tokens[current + 2];
            close = tokens[current + 3];

            if ((open.type === 'symbol' && open.value === '(') &&
                (token.type === 'word' && /^[\w\-]*$/.test(token.value)) &&
                (close.type === 'symbol' && close.value === ')')) {
                ret.push({
                    type: 'attr',
                    value: token.value
                });
                current += 4;
                continue;
            } else {
                throw new SyntaxError('attr' + open.value + token.value + close.value);
            }
        }

        current++;
    }

    // `sss\"` >>> `sss"`
    function parseString(input) {
        input = input.replace(/(?:^"|"$)|(?:^'|'$)/g, '');
        var current = 0;
        var length = input.length;
        var value = '';
        var char;

        while (current < length) {
            char = input.charAt(current);
            if (char === '\\') {
                value += input.charAt(++current);
            } else {
                value += char;
            }
            current++;
        }

        return value;
    }

    return ret;
}


/**
 * 获取 CSS value 的 tokens
 * @param   {String}
 * @return  {Array}
 */
function tokenizer(input) {
    var current = 0;
    var tokens = [];
    var length = input.length;
    var STRING = /["']/;
    var WHITESPACE = /\s/;
    var SYMBOL = /[(),/]/;
    var WORDS = /[^"'\s(),/]/;
    var quotation, value, char;

    while (current < length) {
        char = input[current];

        if (SYMBOL.test(char)) {
            tokens.push({
                type: 'symbol',
                value: char
            });

            current++;
            continue;
        }

        if (WHITESPACE.test(char)) {
            current++;
            continue;
        }

        if (STRING.test(char)) {
            quotation = char;
            value = quotation;

            while (current < length) {
                char = input.charAt(++current);
                value += char;

                if (char === '\\') {
                    value += input.charAt(++current);
                    continue;
                }

                if (char === quotation) {
                    break;
                }
            }

            tokens.push({
                type: 'string',
                value: value
            });

            current++;
            continue;
        }

        if (WORDS.test(char)) {
            value = '';

            while (WORDS.test(char)) {
                value += char;
                char = input[++current];
            }

            tokens.push({
                type: 'word',
                value: value
            });

            continue;
        }

        current++;
        throw new TypeError('Unexpected identifier: ' + char);
    }

    return tokens;
}

var defaultFSInfo = {
    default: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'normal',
    },
    address: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
    b: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    cite: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
    code: {
        'font-family': ['monospace'],
        'font-style': 'normal',
        'font-weight': 'normal',
    },
    dfn: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
    em: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
    h1: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    h2: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    h3: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    h4: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    h5: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    h6: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    i: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
    kbd: {
        'font-family': ['monospace'],
        'font-style': 'normal',
        'font-weight': 'normal',
    },
    pre: {
        'font-family': ['monospace'],
        'font-style': 'normal',
        'font-weight': 'normal',
    },
    samp: {
        'font-family': ['monospace'],
        'font-style': 'normal',
        'font-weight': 'normal',
    },
    strong: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    th: {
        'font-family': [],
        'font-style': 'normal',
        'font-weight': 'bold',
    },
    var: {
        'font-family': [],
        'font-style': 'italic',
        'font-weight': 'normal',
    },
};


var fontStyleOrder = {
    'normal': {
        'normal': 0,
        'oblique': 1,
        'italic': 2,
    },
    'italic': {
        'italic': 0,
        'oblique': 1,
        'normal': 2,
    },
    'oblique': {
        'oblique': 0,
        'italic': 1,
        'normal': 2,
    },
};



module.exports = {
    split: split,
    tokenizer: tokenizer,
    cssContentParser: cssContentParser,
    defaultFSInfo: defaultFSInfo,
    fontStyleOrder: fontStyleOrder
};