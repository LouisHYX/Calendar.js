/**
 * 日历插件
 */
var Calendar = (function () {
    "use strict";

    /**
     * 日历构造函数
     * @constructor
     */
    function Calendar(el, options) {
        var _el = el || '#calendar', //calendar最外层盒子id
            _options = { //默认配置参数
                fold: true, //是否支持收起
                afterSlide: null, //横滑之后的回调
                afterTransform: null, //展开收起之后的回调，若fold属性设为false则该项不生效
            };

        //配置参数
        this.options = Utils.comParams(options || {}, _options);

        //DOM节点
        this.calendar = document.querySelector(_el);
        this.title = this.calendar.querySelector(_el + ' .title');
        this.backToToday = this.calendar.querySelector(_el + ' .backToToday');
        this.weekNames = this.calendar.querySelectorAll(_el + ' .weekBar > li');
        this.calendarPanel = this.calendar.querySelector(_el + ' .calendarPanel');
        this.calendarPanel.insertBefore(this.createFragment(), this.calendarPanel.childNodes[0]);
        this.months = this.calendarPanel.querySelectorAll(_el + ' .month');
        this.weeks = this.calendarPanel.querySelectorAll(_el + ' .week');
        this.days = this.calendarPanel.querySelectorAll(_el + ' .day');
        this.days0 = this.months[0].querySelectorAll(_el + ' .day');
        this.days1 = this.months[1].querySelectorAll(_el + ' .day');
        this.days2 = this.months[2].querySelectorAll(_el + ' .day');
        this.foldBox = this.calendarPanel.querySelector(_el + ' .foldBox');

        //事件
        this.events = [ //所有事件存放于该数组，等待程序逐一绑定
            {
                event: 'resize', listener: window, handler: function () {
                    this.layout();
                }.bind(this)
            },
            {
                event: 'touchend', listener: this.backToToday, handler: function () {
                    this.reset();
                }.bind(this)
            },
            {
                event: 'transitionend', listener: this.calendarPanel, handler: function (e) {
                    e.stopPropagation();
                    this.removeAnimation(this.calendarPanel);
                }.bind(this)
            },
            {
                event: 'touchstart', listener: this.calendarPanel, handler: function (e) {
                    e.stopPropagation();
                    this.touchStartPos = this.touchMovePos = e.changedTouches[0];
                    this.touchStartTime = new Date().getTime();
                }.bind(this)
            },
            {
                event: 'touchmove', listener: this.calendarPanel, handler: function (e) {
                    e.preventDefault();

                    //月份面板左右滑动
                    this.slideHorizontal(e);

                    //日历展开收起
                    this.slideVertical(e);

                    //获取手指在屏幕上的即时位置
                    this.touchMovePos = e.changedTouches[0];

                    //确定滑动方向
                    this.setDirection();

                    //获取所需的日历数据
                    this.getCalendarData();
                }.bind(this)
            },
            {
                event: 'touchend', listener: this.calendarPanel, handler: function (e) {
                    e.stopPropagation();

                    //点击后的日期选择状态
                    if (this.selectAllowed && e.target.className.indexOf('day') !== -1 && e.target.tagName === 'SPAN') {
                        for (var i = 0; i < this.days.length; i++) {
                            this.days[i].classList.remove('selected');
                        }
                        e.target.classList.add('selected');
                        this.selectDate(e);
                    }

                    this.touchEndPos = e.changedTouches[0];
                    this.touchMovePos = null;
                    this.touchEndTime = new Date().getTime();
                    this.afterTouch();
                }.bind(this)
            },
        ];
        this.v = 1; //手指在屏幕上滑动的平均速度阈值
        this.touchStartPos = null; //手指开始触摸时的位置信息
        this.touchMovePos = null; //手指滑动时的实时位置信息
        this.touchEndPos = null; //手指结束触摸时的位置信息
        this.slideDir = 0; //保存手指的滑动方向
        this.selectAllowed = true; //是否允许单个日期的点击，在手指滑动过程中不允许触发日期点击事件
        this.slideDirLock = false; //滑动方向锁
        this.touchStartTime = null; //手指触摸开始时的时间
        this.touchEndTime = null; //手指触摸结束时的时间
        this.slideLock = false; //滑动锁，避免在面板滑动过程中手指多次触发动画

        //日历
        this.date = new Date();
        this.year = this.date.getFullYear(); //获取本月年份
        this.month = this.date.getMonth(); //获取本月月份
        this.day = this.date.getDate(); //获取今天几号
        this.yearTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.year）
        this.monthTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.month）
        this.dayTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.day）
        this.fold = false; //日历是否为收起状态
        this.monthsLeft = []; //存放三个月份面板的left值，在滑动过程中刷新该数组，作为滑动后面板位置的终值
        this.panelHeight = {}; //存放面板的高度，作为展开收起后面板高度的终值
        this.getData = true; //是否允许从Utils对象中获取日历数据

        //初始化
        this.init();
    }

    Calendar.prototype = {

        /**
         * 日历初始化
         */
        init: function () {
            try {
                this.layout();
                this.setData();
                this.bindEvent();
            } catch (e) {
                if (e instanceof Error) {
                    console.error(e.name + ', ' + e.message + ', ' + e.stack);
                } else {
                    console.error('未知错误：' + e);
                }
            }
        },

        /**
         * 实现日历重置
         */
        reset: function () {

        },

        /**
         * 月份面板左右滑动
         */
        slideHorizontal: function (e) {
            if ((this.slideDir === 3 || this.slideDir === 4) && e.target.className !== 'foldBox') {
                for (var i = 0; i < this.months.length; i++) {
                    this.months[i].style.left = this.months[i].offsetLeft + (e.changedTouches[0].pageX - this.touchMovePos.pageX) + 'px';
                }
            }
        },

        /**
         * 日历展开收起
         */
        slideVertical: function (e) {
            if (this.slideDir === 1 || this.slideDir === 2) {
                this.calendarPanel.style.height = this.calendarPanel.offsetHeight + (e.changedTouches[0].pageY - this.touchMovePos.pageY) + 'px';
            }
        },

        /**
         *  在面板滑动时开始获取并设置日历数据
         */
        getCalendarData: function () {
            if (this.getData) {
                this.getTitleInfo();
                this.setData(this.slideDir);
                this.getData = false;
            }
        },

        /**
         * 设置日历数据：手指左滑时渲染下个月的数据，右滑时渲染上个月的数据，没有方向时则默认加载本月数据
         */
        setData: function (dir) {
            var _dir = dir || this.slideDir,
                _year = this.year,
                _month = this.month,
                _day = this.day,
                _lastMonth = _month - 1 >= 0 ? _month - 1 : 11, //获取上个月的月份
                _lastYear = _lastMonth !== 11 ? _year : _year - 1, //获取上个月的年份
                _nextMonth = _month + 1 <= 11 ? _month + 1 : 0, //获取上个月的月份
                _nextYear = _nextMonth !== 0 ? _year : _year + 1; //获取下个月的年份

            switch (_dir) {
                case 0:
                    this.renderData(Utils.getMonthData(_year, _month), this.days1);
                    this.rewriteTitle(_year, _month, _day);

                    //设置今天
                    for (var c = 0; c < this.days1.length; c++) {
                        if (parseInt(this.days1[c].innerText) === _day && this.days1[c].className.indexOf('cur') !== -1) {
                            this.days1[c].classList.add('selected');
                            this.days1[c].parentNode.classList.add('curWeek');
                            break;
                        }
                    }
                    break;
                case 1:
                case 2:
                    break;
                case 3:
                    for (var a = 0; a < this.monthsLeft.length; a++) {
                        if (this.monthsLeft[a].left > 0) {
                            this.renderData(Utils.getMonthData(_nextYear, _nextMonth), this.monthsLeft[a].days);
                            this.yearTemp = _nextYear;
                            this.monthTemp = _nextMonth;
                            this.dayTemp = 1;
                            break;
                        }
                    }

                    break;
                case 4:
                    for (var b = 0; b < this.monthsLeft.length; b++) {
                        if (this.monthsLeft[b].left < 0) {
                            this.renderData(Utils.getMonthData(_lastYear, _lastMonth), this.monthsLeft[b].days);
                            this.yearTemp = _lastYear;
                            this.monthTemp = _lastMonth;
                            this.dayTemp = 1;
                            break;
                        }
                    }
                    break;
            }
        },

        /**
         * 在DOM中显示日期数据
         */
        renderData: function (dt, dy) {
            for (var i = 0; i < dy.length; i++) {
                dy[i].innerText = dt[i].date;
                dy[i].classList.add(dt[i].class);
                if (dt[i].today) {
                    dy[i].classList.add('today');
                } else {
                    dy[i].classList.remove('today');
                }
            }
        },

        /**
         * 修改日历标题的日期显示
         */
        rewriteTitle: function (y, m, d) {
            this.title.innerText = y + '-' + (m + 1) + '-' + d;
        },

        /**
         * 获取Title中的日期信息：包括年、月、日
         */
        getTitleInfo: function () {
            var _ymd = this.title.innerText.split('-');
            this.year = parseInt(_ymd[0]);
            this.month = parseInt(_ymd[1]) - 1;
            this.day = parseInt(_ymd[2]);
        },

        /**
         * 手指离开屏幕后执行一系列操作
         */
        afterTouch: function () {

            //月份面板的左右滑动
            if ((this.slideDir === 3 || this.slideDir === 4) && this.isSliding()) {
                this.year = this.yearTemp;
                this.month = this.monthTemp;
                this.day = this.dayTemp;
                this.swapEle();
            }
            if (!this.slideLock) {
                this.startAnimation(this.calendarPanel, 'height', 0.2);
                this.slide();
                this.slideLock = true;
            }

            //月份面板的展开收起
            if ((this.slideDir === 1 || this.slideDir === 2) && this.isSliding()) {
                // this.startAnimation(this.calendarPanel, 'height', 0.2);
                this.foldOrUnfold();
            } else {
                // this.startAnimation(this.calendarPanel, 'height', 0.2);
                this.posRebound();
            }

            //重写标题日期
            this.rewriteTitle(this.year, this.month, this.day);

            //重置是否可以获取滑动方向的开关
            this.slideDirLock = false;

            //重置是否可以获取必要的日历数据开关
            this.getData = true;

            //恢复允许单个日期的点击
            setTimeout(function () {
                this.selectAllowed = true;
            }.bind(this), 10);

            //选择当月1号
            this.selectFirstDay();
        },

        /**
         * 指定元素开启动画
         */
        startAnimation: function (ele, a, t, c) {
            var _a = a || 'all',
                _t = t.toString() || '0.3',
                _c = c || 'ease';
            if (!ele) {
                return false;
            }
            ele.style.transition = _a + ' ' + _t + 's' + ' ' + _c;
        },

        /**
         * 删除动画
         */
        removeAnimation: function (ele) {
            if (!ele) {
                return false;
            }
            ele.style.removeProperty('transition');
            this.slideLock = false;
        },

        /**
         * 每次成功滑动月份面板则选择当月1号为默认选中
         */
        selectFirstDay: function () {
            // for (var i = 0; i < this.monthsLeft.length; i++) {
            //     if (this.monthsLeft[i] === 0) {
            //         this.months[i] = 0;
            //     }
            // }
        },

        /**
         * 实现根据手指滑动方向正序或倒序移动数组元素
         */
        swapEle: function () {
            var _tempEle = null;
            switch (this.slideDir) {
                case 3:
                    _tempEle = this.monthsLeft[this.monthsLeft.length - 1].left;
                    for (var i = this.monthsLeft.length - 1; i >= 0; i--) {
                        if (i === 0) {
                            this.monthsLeft[i].left = _tempEle;
                            break;
                        }
                        this.monthsLeft[i].left = this.monthsLeft[i - 1].left;
                    }
                    break;
                case 4:
                    _tempEle = this.monthsLeft[0].left;
                    for (var j = 0; j < this.monthsLeft.length; j++) {
                        if (j === this.monthsLeft.length - 1) {
                            this.monthsLeft[j].left = _tempEle;
                            break;
                        }
                        this.monthsLeft[j].left = this.monthsLeft[j + 1].left;
                    }
                    break;
            }
        },

        /**
         * 判断当前是否满足滑动条件
         */
        isSliding: function () {
            switch (this.slideDir) {
                case 0:
                    break;
                case 1:
                case 2:
                    //手指滑动平均速度超过阈值V
                    if (Math.abs(this.touchStartPos.pageY - this.touchEndPos.pageY) / (this.touchEndTime - this.touchStartTime) >= this.v) {
                        return true;
                    }

                    //面板滑动距离超过自身高度1/2
                    if (Math.abs(this.touchStartPos.pageY - this.touchEndPos.pageY) >= this.calendarPanel.offsetHeight / 2) {
                        return true;
                    }
                    break;
                case 3:
                case 4:
                    //手指滑动平均速度超过阈值V
                    if (Math.abs(this.touchStartPos.pageX - this.touchEndPos.pageX) / (this.touchEndTime - this.touchStartTime) >= this.v) {
                        return true;
                    }

                    //面板滑动距离超过自身宽度1/2
                    if (Math.abs(this.touchStartPos.pageX - this.touchEndPos.pageX) >= this.calendarPanel.offsetWidth / 2) {
                        return true;
                    }
                    break;
            }
        },

        /**
         * 实现月份面板的滑动：调整选中日期，面板位置等
         */
        slide: function () {
            for (var i = 0; i < this.months.length; i++) {
                this.months[i].style.left = this.monthsLeft[i].left + 'px';
            }
        },

        /**
         * 当不满足展开或收起条件时，恢复到之前的状态
         */
        posRebound: function () {
            switch (this.fold) {
                case true:
                    this.calendarPanel.style.height = this.panelHeight.fold + 'px';
                    this.foldBox.style.backgroundImage = 'url("img/arrow_downward.png")';
                    break;
                case false:
                    this.calendarPanel.style.height = this.panelHeight.unfold + 'px';
                    this.foldBox.style.backgroundImage = 'url("img/arrow_upward.png")';
                    break;
            }
        },

        /**
         * 实现日期面板展开或收起
         */
        foldOrUnfold: function () {
            switch (this.fold) {
                case true:
                    this.calendarPanel.style.height = this.panelHeight.unfold + 'px';
                    this.foldBox.style.backgroundImage = 'url("img/arrow_upward.png")';
                    this.fold = false;
                    break;
                case false:
                    this.calendarPanel.style.height = this.panelHeight.fold + 'px';
                    this.foldBox.style.backgroundImage = 'url("img/arrow_downward.png")';
                    this.fold = true;
                    break;
            }
        },

        /**
         * 创建完整DOM文档碎片：3个月份面板每个6行7列
         */
        createFragment: function () {
            var _fragment = document.createDocumentFragment(),
                _ul = null,
                _li = null,
                _span = null;

            //3个月份面板来回切换，满足无限年份的需求
            for (var m = 0; m < 3; m++) {
                _ul = document.createElement('ul');
                _ul.classList.add('month');
                for (var w = 0; w < 6; w++) {
                    _li = document.createElement('li');
                    _li.classList.add('week');
                    for (var d = 0; d < 7; d++) {
                        _span = document.createElement('span');
                        _span.classList.add('day');
                        _li.appendChild(_span);
                        _span.innerText = d.toString();
                    }
                    _ul.appendChild(_li);
                }
                _fragment.appendChild(_ul);
            }
            return _fragment;
        },

        /**
         * 实现DOM结构的基本布局
         */
        layout: function () {

            //设置每一个月份面板的初始left值
            for (var w = 0; w < this.months.length; w++) {
                this.months[w].style.left = this.calendarPanel.offsetWidth * (w - 1) + 'px';
                this.monthsLeft[w] = {};
                this.monthsLeft[w].left = this.months[w].offsetLeft;
                this.monthsLeft[w].days = [this.days0, this.days1, this.days2][w];
            }

            //设置日历面板展开和收起时的高度值
            this.panelHeight.fold = this.weeks[0].offsetHeight + this.foldBox.offsetHeight;
            this.panelHeight.unfold = this.months[0].offsetHeight + this.foldBox.offsetHeight;

            //根据盒子宽度设置每一天的间距
            var _w = ((this.calendar.offsetWidth / 7) - this.weekNames[0].offsetWidth) / 2;
            for (var d = 0; d < this.days.length; d++) {
                this.days[d].style.margin = '12px ' + _w + 'px';
                if (d < this.weekNames.length) {
                    this.weekNames[d].style.margin = '12px ' + _w + 'px';
                }
            }
        },

        /**
         * 单个日期点击事件
         */
        selectDate: function (e) {
            var _curWeek = e.target.parentNode;

            //给当前被选择元素所在的横行添加class
            for (var i = 0; i < this.weeks.length; i++) {
                this.weeks[i].classList.remove('curWeek');
            }
            _curWeek.classList.add('curWeek');
        },

        /**
         * 在手指刚开始滑动时设置滑动方向及其相关属性
         */
        setDirection: function () {
            if (!this.slideDirLock) {
                this.slideDir = this.getDirection(this.touchStartPos.pageX, this.touchStartPos.pageY, this.touchMovePos.pageX, this.touchMovePos.pageY);
                this.selectAllowed = false; //禁止在滑动时自动选择日期
                this.slideDirLock = true; //锁住滑动方向，避免重复执行方向计算
            }
        },

        /**
         * 实现获取滑动方向
         */
        getDirection: function (x1, y1, x2, y2) {
            var _angX = x2 - x1,
                _angY = y2 - y1,
                _angle = null;

            //如果滑动距离太短
            if (Math.abs(_angX) < 2 && Math.abs(_angY) < 2) {
                return 0; //手指未滑动
            }

            _angle = Utils.getAngle(_angX, _angY);

            if (_angle >= -135 && _angle <= -45) {
                return 1; //手指上滑
            } else if (_angle > 45 && _angle < 135) {
                return 2; //手指下滑
            } else if ((_angle >= 135 && _angle <= 180) || (_angle >= -180 && _angle < -135)) {
                return 3; //手指左滑
            } else if (_angle >= -45 && _angle <= 45) {
                return 4; //手指右滑
            }
        },

        /**
         * 事件绑定
         */
        bindEvent: function () {
            this.events.forEach(function (item) {
                if (item.listener.constructor === NodeList || item.listener instanceof Array) {
                    for (var n = 0; n < item.listener.length; n++) {
                        item.listener[n].addEventListener(item.event, item.handler);
                    }
                } else if (item.listener.length === undefined || item.listener.length === 0) {
                    item.listener.addEventListener(item.event, item.handler);
                }
            }.bind(this));
        },

        /**
         * 实现用户可在外部自行注册事件
         */
        registerEvent: function (e, l, h) {
            this.events.push({
                event: e, listener: l, handler: h.bind(this)
            });
        }
    };

    /**
     * 辅助功能
     */
    var Utils = (function () {
        var _utils = {};

        _utils.monthDays = { //每月的天数
            "0": 31,
            "1": null,
            "2": 31,
            "3": 30,
            "4": 31,
            "5": 30,
            "6": 31,
            "7": 31,
            "8": 30,
            "9": 31,
            "10": 30,
            "11": 31
        };

        /**
         * 获取某年某月的日期数据
         */
        _utils.getMonthData = function (y, m) {
            var curDate = new Date(),
                _date = new Date(y, m),
                _monthDays = m === 1 ? (_utils.isLeapYear(y) ? 29 : 28) : _utils.monthDays[m.toString()], //当月的天数
                _monthData = new Array(42), //存放一个月所需的所有日期数据，要填满7*6个格，格式：[{class: null, date: null}]
                _fisrtDay = _date.getDay(), //当月1号的索引
                _lastMonthLastDay = new Date(y, m, 0).getDate(); //当月的上个月最后一天


            for (var i = 0; i < _monthData.length; i++) {
                _monthData[i] = {};
                if (_fisrtDay <= i && i < _fisrtDay + _monthDays) { //设置当月日期
                    if (curDate.getFullYear() === y && curDate.getMonth() === m && curDate.getDate() === i - _fisrtDay + 1) { //添加今天的标签
                        _monthData[i].today = true;
                    }
                    _monthData[i].class = 'cur';
                    _monthData[i].date = i - _fisrtDay + 1;
                } else {
                    _monthData[i].class = 'oth';
                    if (i < _fisrtDay) { //设置上个月日期
                        _monthData[i].date = _lastMonthLastDay - _fisrtDay + i + 1;
                    }
                    if (i >= _fisrtDay + _monthDays) {
                        _monthData[i].date = i - (_fisrtDay + _monthDays - 1);
                    }
                }
            }

            return _monthData;
        };

        /**
         * 判断是否是闰年
         */
        _utils.isLeapYear = function (year) {
            return (year % 400 === 0) || (year % 100 !== 0 && year % 4 === 0);
        };

        /**
         * 获取两条线之间的角度
         */
        _utils.getAngle = function (a, b) {
            return Math.atan2(b, a) * 180 / Math.PI;
        };

        /**
         * 合并参数
         */
        _utils.comParams = function (cus, def) {
            var res = {};  //需要返回的结果
            if (cus === undefined) {
                cus = {};
            }

            //判断参数是否为object,返回true或false
            function isObject(o) {
                return Object.prototype.toString.call(o) === '[object Object]';
            }

            for (var key in def) {
                if (def.hasOwnProperty(key)) {  //默认参数是否具有key属性
                    if (cus.hasOwnProperty(key)) {  //自定义参数是否具有key属性
                        if (isObject(def[key]) && isObject(cus[key])) {  //默认参数与自定义参数的key属性是否都是object
                            this.comParams(cus[key], def[key]);  //key属性都为object就进行递归
                        } else {
                            res[key] = {};  //如果其中一个key属性不是object,那就赋值为{}
                        }
                        res[key] = cus[key];  //如果key属性都不为object就赋值为自定义参数的key属性
                    } else {
                        res[key] = def[key];  //如果自定义参数没有key属性,就赋值为默认参数的key属性
                    }
                }
            }
            return res;
        };

        return _utils;
    })();

    return Calendar;
})();


