(function () {
    'use strict';

    class Terminal {
        constructor(terminalId) {
            this.id = terminalId;
            this.terminalElem = document.getElementById(this.id);
            this.terminalElem.addEventListener('click', () => {
                this.terminalElem
                    .querySelector('input:last-child')
                    .focus()
                    ;
            });
        }
        in({oninput, hidden} = {}) {
            return new Promise(res => {
                const lastLine = this.terminalElem.lastElementChild;
                const inputElem = document.createElement('input');
                inputElem.type = 'text';
                if (lastLine !== null && [...lastLine.classList].includes('line')) {
                    const spans = [...lastLine.children];
                    if (spans.length !== 0) {
                        const lineWidth = lastLine.offsetWidth;
                        const spansWidth = spans
                            .map(e => e.offsetWidth)
                            .reduce((a, c) => a + c)
                            ;
                        inputElem.style.width = `${lineWidth - spansWidth}px`;
                    } else {
                        inputElem.style.width = '100%';
                    }
                    lastLine.appendChild(inputElem);
                } else {
                    const line = this._createNewLine();
                    line.appendChild(inputElem);
                    inputElem.style.width = '100%';
                    this.terminalElem.appendChild(line);
                }
                inputElem.focus();
                if (hidden)inputElem.style.color = 'rgba(0,0,0,0)';
                else if (typeof (oninput) === 'function') inputElem.addEventListener('input', oninput);
                let onchange, onkeydown;
                inputElem.addEventListener('change', onchange = (e) => {
                    const text = e.srcElement.value;
                    const color = e.srcElement.style.color;
                    const bgColor = e.srcElement.style.backgroundColor;
                    const currentLine = e.srcElement.parentNode;
                    e.srcElement.removeEventListener('change', onchange);
                    e.srcElement.removeEventListener('keydown', onkeydown);
                    e.srcElement.remove();
                    this._appendSpan(currentLine, text, {color, bgColor});
                    this.terminalElem.appendChild(this._createNewLine());
                    res(text);
                });
                inputElem.addEventListener('keydown', onkeydown = (e) => {
                    if (e.ctrlKey && e.key === 'd') {
                        e.preventDefault();
                        e.stopPropagation();
                        const text = e.srcElement.value;
                        const color = e.srcElement.style.color;
                        const bgColor = e.srcElement.style.backgroundColor;
                        const currentLine = e.srcElement.parentNode;
                        e.srcElement.removeEventListener('change', onchange);
                        e.srcElement.removeEventListener('keydown', onkeydown);
                        e.srcElement.remove();
                        this._appendSpan(currentLine, `${text}^D`, {color, bgColor});
                        this.terminalElem.appendChild(this._createNewLine());
                        res(`${text}\x04`);
                    }
                });
            });
        }
        out(text, style = {}) {
            const lines = text.split(/\n/);
            const lastLine = this.terminalElem.lastElementChild;
            if (lastLine !== null && [...lastLine.classList].includes('line')) {
                this._appendSpan(lastLine, lines[0], style);
            } else {
                const line = this._createNewLine();
                this._appendSpan(line, lines[0], style);
                this.terminalElem.appendChild(line);
            }
            for (let i = 1; i < lines.length; i++) {
                const line = this._createNewLine();
                this._appendSpan(line, lines[i], style);
                this.terminalElem.appendChild(line);
            }
            this.terminalElem.lastElementChild.scrollIntoView();
        }
        clear() {
            [...this.terminalElem.getElementsByClassName('line')].forEach(e => e.remove());
        }
        _escape(str) {
            str = str.replace(/&/g, '&amp;');
            str = str.replace(/</g, '&lt;');
            str = str.replace(/>/g, '&gt;');
            str = str.replace(/"/g, '&quot;');
            str = str.replace(/'/g, '&#39;');
            str = str.replace(/\s/g, '&nbsp;');
            return str;
        }
        _createNewLine() {
            const line = document.createElement('div');
            line.classList.add('line');
            return line;
        }
        _appendSpan(line, string, {color, bgColor} = {}) {
            const span = document.createElement('span');
            span.innerHTML = this._escape(string);
            if (color !== undefined) span.style.color = color;
            if (bgColor !== undefined) span.style.backgroundColor = bgColor;
            line.appendChild(span);
        }
    }

    class Buffer{
        constructor() {
            this.data = [];
        }
        out(input) {
            this.data.push(input);
        }
        in() {
            return this.data.shift();
        }
        clear() {
            this.data = [];
        }
    }

    class Shell {
        constructor(
            terminal,
            version,
            promptFunc = (out, isError) => out('> ', {color: (isError ? 'red' : 'white')})
        ) {
            this.user;
            this.password;
            this.killed = false;
            this.version = version;
            this.terminal = terminal;
            this.buffer = new Buffer();
            this.promptFunc = promptFunc;
            this.status = 0;
            this.commands = new Map();
            this.addCommand('help', (io) => {
                io.out('available commands list\n');
                for (const key of [...this.commands.keys()].sort()) {
                    io.out(`* ${key}\n`, {color:'cyan'});
                }
                io.out('available control operator list\n');
                for (const key of ['";"', '"&&"'].sort()) {
                    io.out(`* ${key}\n`, {color: 'cyan'});
                }
                io.out('available pipe list\n');
                for (const key of ['"|"'].sort()) {
                    io.out(`* ${key}\n`, {color: 'cyan'});
                }
                return 0;
            });
            this.addCommand('clear', () => {
                this.terminal.clear();
                return 0;
            });
            this.addCommand('exit', () => {
                this.killed = true;
                return 0;
            });
        }
        addCommand(name, func) {
            this.commands.set(name, func);
        }
        hasCommand(name) {
            return this.commands.has(name);
        }
        async execCommands(commandArray) {
            for (let i = 0; i < commandArray.length; i++){
                const commandData = commandArray[i];
                const io = {};
                if (commandData.before === '|') {
                    io.in = (...args) => this.buffer.in(...args);
                } else {
                    io.in = (...args) => this.terminal.in(...args);
                }
                if (commandData.after === '|') {
                    this.buffer.clear();
                    io.out = (...args) => this.buffer.out(...args);
                } else {
                    io.out = (...args) => this.terminal.out(...args);
                }
                await this.execCommand(commandData.commandName, io, commandData.args);
                if (commandData.after === '|') {
                    this.buffer.out('\x04');
                }
                if (this.status !== 0 && commandData.after === '&&') break;
                if (this.killed) break;
            }
        }
        async execCommand(name, io, args) {
            let cmd;
            if (this.hasCommand(name)) cmd = this.commands.get(name);
            else {
                this.terminal.out(`Command '${name}' not found\n`, {color: 'red'});
                this.status = -1;
                return;
            }
            let status = await cmd(io, args);
            if (typeof (status) !== 'number') status = -1;
            this.status = status;
        }
        parseCommand(input) {
            let keyword = '';
            const tokens = [];
            let err = false;
            for (let i = 0; i < input.length; i++) {
                if (input[i] === '|' || input[i] === ';') {
                    tokens.push(keyword, input[i]);
                    keyword = '';
                } else if (input[i] === '&' && input[i + 1] === '&') {
                    tokens.push(keyword, '&&');
                    keyword = '';
                    i++;
                } else {
                    keyword = keyword.concat(input[i]);
                }
            }
            tokens.push(keyword);
            // ----------
            const commandArray = [];
            for (let i = 0; i < tokens.length; i += 2){
                const [before, current, after] = [tokens[i - 1], tokens[i], tokens[i + 1]];
                const words = current.trim().split(/\s+/).map(w => w.trim());
                const commandName = words.shift();
                if (!this.hasCommand(commandName)) {
                    err = true;
                }
                const args = words;
                commandArray.push({
                    before,
                    after,
                    commandName,
                    args,
                });
            }
            return {commandArray, err};
        }
        async prompt() {
            this.promptFunc((...args) => this.terminal.out(...args), this.status !== 0, this.user);
            const command = await this.terminal.in({
                oninput: ({srcElement}) => {
                    if (srcElement.value === '') {
                        srcElement.style.color = 'white';
                        return;
                    }
                    const {err} = this.parseCommand(srcElement.value);
                    srcElement.style.color = err ? 'red' : 'cyan';
                }
            });
            if (command.includes('\x04')) {
                this.killed = true;
                return;
            }
            const {commandArray} = this.parseCommand(command);
            await this.execCommands(commandArray);
        }
        async run() {
            this.terminal.clear();
            this.terminal.out('login\n');
            this.terminal.out('user: ');
            this.user = await this.terminal.in();
            if (this.user.includes('\x04')) return;
            this.terminal.out('password: ');
            this.password = await this.terminal.in({hidden: true});
            if (this.password.includes('\x04')) return;
            this.killed = false;
            this.terminal.out(`Kuso Zako Terminal Modoki ${this.version}\n\n`, {color: 'gray'});

            while (!this.killed) await this.prompt();
        }
    }

    var _true = () => 0;

    var _false = () => -1;

    var echo = (io, args) => {
        io.out(`${args.join(' ')}\n`);
        return 0;
    };

    var date = (io) => {
        io.out(`${(new Date()).toLocaleString()}\n`);
        return 0;
    };

    var sleep = (io, args) => {
        const sec = parseInt(args[0]);
        if (Number.isNaN(sec)) {
            io.out(`"${args[0]}" is not a Integer\n`, {color: 'red'});
            return -1;
        }
        return new Promise(res => {
            setTimeout(() => res(0), sec * 1000);
        });
    };

    var grep = async (io, args) => {
        const keyword = args[0];
        if (keyword === undefined) return 1;
        let input = '';
        let finished = false;
        while (!finished) {
            if ((input = await io.in()).includes('\x04')) {
                finished = true;
                input = input.replace(/\x04.*/, '');
            }
            for (const line of input.split('\n')) {
                const splittedLine = line.split(keyword);
                if (splittedLine.length === 1) continue;
                for (let i = 0; i < splittedLine.length; i++) {
                    io.out(splittedLine[i]);
                    if (i !== splittedLine.length - 1) io.out(keyword, {color: 'red'});
                }
                io.out('\n');
            }
        }
        return 0;
    };

    var commands = {
        'true': _true,
        'false': _false,
        echo,
        date,
        sleep,
        grep,
    };

    window.onload = async () => {
        const terminal = new Terminal('terminal');
        const shell = new Shell(
            terminal,
            'v0.2.0',
            (out, isError, user) => {
                out(`${user}@pc_hoge: `, {color: 'lime'});
                out('[', {color: 'cyan'});
                out('~');
                out(']', {color: 'cyan'});
                out(isError ? 'x' : ' ', {color: 'red'});
                out('> ');
            }
        );
        for (const [key, val] of Object.entries(commands)) shell.addCommand(key, val);
        while(true) await shell.run();
    };

}());
