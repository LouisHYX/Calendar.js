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
                getSavedDate: null, //获取之前保存的默认展示日期
                getRedDotArr: null, //获取红点标记数据的方法
                afterInit: null, //初始化完成之后的回调
                afterSelect: null, //点击日期之后的回调
                afterSlideToLast: null, //滑到上个月之后的回调
                afterSlideToNext: null, //滑到下个月之后的回调
                afterFold: null, //收起之后的回调
                afterUnfold: null, //展开之后的回调
                afterReset: null, //点击回今天按钮之后的回调
            };

        //配置参数
        this.options = Utils.comParams(options || {}, _options);

        //红点标记
        this.redDotArrFn = this.options.getRedDotArr instanceof Function ? this.options.getRedDotArr : function () {
        }; //指向后台读取红点标记数组的方法
        // this.redDotArr = null; //指向后台读取的红点标记数组
        this.redDotCarrier = []; //保存红点所在的节点
        this.mark = 'mark'; //保存生成红点的class

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
                    if (this.options.afterReset && this.options.afterReset instanceof Function) {
                        this.options.afterReset(this.getTitleInfo());
                    }
                }.bind(this)
            },
            {
                event: 'touchend', listener: this.foldBox, handler: function (e) {
                    e.stopPropagation();

                    //如果手指没有滑动，则默认为点击事件，执行点击后展开或者收起日历
                    if (this.touchMovePos === this.touchStartPos) {
                        this.clickFoldOrUnfold();
                    }

                    //重置触摸数据
                    this.resetTouchData(e);

                    //触摸后的操作
                    this.afterTouch();
                }.bind(this)
            },
            {
                event: 'transitionend', listener: this.calendarPanel, handler: function (e) {
                    e.stopPropagation();

                    //去除月份面板在滑动时动态添加的动画属性
                    this.removeAnimation([this.calendarPanel, this.months[0], this.months[1], this.months[2]]);

                    //横滑之后的操作
                    if (!this.afterSlideLock) {
                        console.log(this.month, this.monthTemp);

                        //面板左右滑动动画结束之后的操作
                        this.afterSlideHorizontal();

                        //重置面板横向滑动动画锁
                        this.afterSlideLock = true;
                    }

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

                    //重置触摸数据
                    this.resetTouchData(e);

                    //触摸后的操作
                    this.afterTouch();

                    //点击后的日期选择状态
                    if (this.selectAllowed && e.target.className.indexOf('day') !== -1 && e.target.tagName === 'SPAN') {
                        this.selectDate(e);
                    } else {
                        this.getCertainDate();
                    }
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

        //日历
        this.date = new Date();
        this.year = this.date.getFullYear(); //获取本月年份
        this.month = this.date.getMonth(); //获取本月月份
        this.day = this.date.getDate(); //获取今天几号
        this.curDate = this.options.getSavedDate() || {year: null, month: null, day: null}; //保存之前所选择的年月日
        this.yearTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.year）
        this.monthTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.month）
        this.dayTemp = null; //临时存储（避免月份面板没有产生切换时标题会更改的问题，只有确认切换后才将该值传给this.day）
        this.weekIndex = 0; //设置日历收起时所展示的当月星期在月份面板中的索引
        this.weekIndexTemp = 0; //缓存日历收起时所展示的当月星期索引，若没有真正的滑动面板，则重新将原值赋给weekIndex
        this.curMonthFirstDay = null; //当前月份面板坐标(0, 0)位置的日期
        this.curMonthLastDay = null; //当前月份面板坐标(6, 5)位置的日期
        this.fold = true; //日历是否为收起状态
        this.curDays = null; //存放当月所有日期
        this.monthsLeftOrigin = []; //存放三个月份面板的left值，该属性作为日历重置时的基本数据
        this.monthsLeft = []; //存放三个月份面板的left值，在滑动过程中刷新该数组，作为滑动后面板位置的终值
        this.monthsTop = []; //存放三个月份面板的Top值，作为日历收起时月份面板Top位置的初始值
        this.panelHeight = {fold: null, unfold: null}; //存放面板的高度，作为展开收起后面板高度的终值
        this.monthTop = {fold: null, unfold: 0}; //存放月份面板的top值，作为展开收起后月份面板的top终值
        this.getData = true; //是否允许从Utils对象中获取日历数据
        this.curWeek = null; //存放当前被选中的日期所在行
        this.afterSlideLock = true; //横滑动画锁

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
                this.afterInitCallBack();
            } catch (e) {
                if (e instanceof Error) {
                    console.error(e.name + ', ' + e.message + ', ' + e.stack);
                } else {
                    console.error('未知错误：' + e);
                }
            }
        },

        /**
         * 日历初始化完成后的回调
         */
        afterInitCallBack: function () {
            if (this.options.afterInit && this.options.afterInit instanceof Function) {
                this.options.afterInit.bind(this)();
            }
        },

        /**
         * 实现日历重置
         */
        reset: function () {
            var _year = this.date.getFullYear(),
                _month = this.date.getMonth(),
                _day = this.date.getDate();

            this.yearTemp = _year;
            this.monthTemp = _month;
            this.dayTemp = _day;
            this.getTempDate();

            //清除日期选中样式
            for (var x = 0; x < this.days.length; x++) {
                this.days[x].classList.remove('selected');
            }

            //重置月份面板left位置
            for (var i = 0; i < this.months.length; i++) {
                this.months[i].style.left = this.monthsLeftOrigin[i] + 'px';
            }

            this.renderData(Utils.getMonthData(_year, _month), this.days1);
            this.rewriteTitle(_year, _month, _day);

            //设置为今天
            this.setCurDate(_day);

            //设置当前月份日期
            this.curDays = this.monthsLeft[1].days;

            if (this.fold) {
                this.months[1].style.top = -this.curWeek.offsetTop + 'px';
            }

            //添加红点
            this.renderRedDot(this.redDotArrFn(), this.curDays);
        },

        /**
         * 重置触摸数据
         */
        resetTouchData: function (e) {
            this.touchEndPos = e.changedTouches[0];
            this.touchMovePos = null;
            this.touchEndTime = new Date().getTime();
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
            var _ratio = this.curWeek.offsetTop / (this.panelHeight.unfold - this.panelHeight.fold); //月份面板跟随运动的长度比例

            if (this.slideDir === 1 || this.slideDir === 2) {
                this.calendarPanel.style.height = this.calendarPanel.offsetHeight + (e.changedTouches[0].pageY - this.touchMovePos.pageY) + 'px';

                if (this.slideDir === 1 && !this.fold) {

                    //月份面板的滑动，收起时展示当前选中的那一行，展开时还原
                    for (var i = 0; i < this.months.length; i++) {
                        this.months[i].style.top = this.months[i].offsetTop + (e.changedTouches[0].pageY - this.touchMovePos.pageY) * _ratio + 'px'
                    }
                }
                if (this.slideDir === 2 && this.fold) {

                    //月份面板的滑动，收起时展示当前选中的那一行，展开时还原
                    for (var j = 0; j < this.months.length; j++) {
                        this.months[j].style.top = this.months[j].offsetTop + (e.changedTouches[0].pageY - this.touchMovePos.pageY) * _ratio + 'px'
                    }
                }
            }

        },

        /**
         *  在面板滑动时开始获取并设置日历数据
         */
        getCalendarData: function () {
            if (this.getData) {
                this.setData(this.slideDir);
                this.getData = false;
            }
        },

        /**
         * 设置日历数据：手指左滑时渲染下个月的数据，右滑时渲染上个月的数据，没有方向时则默认加载本月数据
         */
        setData: function (dir) {
            var _dir = dir || this.slideDir,
                _year = this.curDate.year || this.year,
                _month = this.curDate.month ? this.curDate.month - 1 : this.month,
                _day = this.curDate.day || this.day,
                _lastMonth = _month - 1 >= 0 ? _month - 1 : 11, //获取上个月的月份
                _lastYear = _lastMonth !== 11 ? _year : _year - 1, //获取上个月的年份
                _nextMonth = _month + 1 <= 11 ? _month + 1 : 0, //获取上个月的月份
                _nextYear = _nextMonth !== 0 ? _year : _year + 1; //获取下个月的年份

            switch (_dir) {
                case 0:
                    this.yearTemp = _year;
                    this.monthTemp = _month;
                    this.dayTemp = _day;
                    this.getTempDate();

                    //渲染日历面板数据
                    this.renderData(Utils.getMonthData(_year, _month), this.days1);
                    this.rewriteTitle(_year, _month, _day);

                    //设置日历当前应该展示的日期
                    this.setCurDate(_day);

                    //修改月份面板top值以展示当前星期
                    if (this.fold) {
                        this.months[1].style.top = -this.curWeek.offsetTop + 'px';
                    }

                    //置空
                    this.curDate = {year: null, month: null, day: null};
                    break;
                case 1:
                case 2:
                    break;
                case 3:
                    for (var a = 0; a < this.monthsLeft.length; a++) {
                        if (this.monthsLeft[a].left > 0) {
                            if (this.fold) {
                                this.weekIndex < 5 ? this.weekIndex++ : this.weekIndex = 0;
                                if (this.weekIndex === 0) {
                                    this.renderData(Utils.getMonthData(_nextYear, _nextMonth), this.monthsLeft[a].days);
                                    this.yearTemp = _nextYear;
                                    this.monthTemp = _nextMonth;

                                    //如果在收起状态从这个月滑到下个月，则要排除在下个月中这个月的数据显示
                                    for (var x = 0; x < this.monthsLeft[a].days.length; x++) {
                                        if (this.monthsLeft[a].days[x].innerText === this.curMonthLastDay) {
                                            this.weekIndex = (Math.floor(x / 7) === 5 ? 1 : Math.floor(x / 7) + 1);
                                            break;
                                        }
                                    }
                                    this.curMonthLastDay = null;
                                } else {
                                    this.renderData(Utils.getMonthData(_year, _month), this.monthsLeft[a].days);
                                    this.getCurMonthLastDay(this.monthsLeft[a].days)
                                }
                                this.months[a].style.top = this.monthsTop[this.weekIndex] + 'px'
                            } else {
                                this.renderData(Utils.getMonthData(_nextYear, _nextMonth), this.monthsLeft[a].days);
                                this.yearTemp = _nextYear;
                                this.monthTemp = _nextMonth;
                                this.dayTemp = 1;
                            }
                            break;
                        }
                    }
                    break;
                case 4:
                    for (var b = 0; b < this.monthsLeft.length; b++) {
                        if (this.monthsLeft[b].left < 0) {
                            if (this.fold) {
                                this.weekIndex > 0 ? this.weekIndex-- : this.weekIndex = 5;
                                if (this.weekIndex === 5) {
                                    this.renderData(Utils.getMonthData(_lastYear, _lastMonth), this.monthsLeft[b].days);
                                    this.yearTemp = _lastYear;
                                    this.monthTemp = _lastMonth;

                                    //如果在收起状态从这个月滑到上个月，则要排除在上个月中这个月的数据显示
                                    for (var y = this.monthsLeft[b].days.length - 1; y >= 0; y--) {
                                        if (this.monthsLeft[b].days[y].innerText === this.curMonthFirstDay) {
                                            this.weekIndex = (Math.floor(y / 7) === 0 ? 4 : Math.floor(y / 7) - 1);

                                            break;
                                        }
                                    }
                                    this.curMonthFirstDay = null;

                                } else {
                                    this.renderData(Utils.getMonthData(_year, _month), this.monthsLeft[b].days);
                                    this.getCurMonthFirstDay(this.monthsLeft[b].days);
                                }
                                this.months[b].style.top = this.monthsTop[this.weekIndex] + 'px';
                            } else {
                                this.renderData(Utils.getMonthData(_lastYear, _lastMonth), this.monthsLeft[b].days);
                                this.yearTemp = _lastYear;
                                this.monthTemp = _lastMonth;
                                this.dayTemp = 1;
                            }
                            break;
                        }
                    }
                    break;
            }
        },

        /**
         * 获取当月坐标（0,0）位置的日期
         */
        getCurMonthFirstDay: function (days) {
            if (!this.curMonthFirstDay) {
                this.curMonthFirstDay = days[0].innerText;
            }
        },

        /**
         * 获取当月坐标（6,5）位置的日期
         */
        getCurMonthLastDay: function (days) {
            if (!this.curMonthLastDay) {
                this.curMonthLastDay = days[days.length - 1].innerText;
            }
        },

        /**
         * 在DOM中显示日期数据
         */
        renderData: function (dt, dy) {
            for (var i = 0; i < dy.length; i++) {
                dy[i].innerText = dt[i].date;
                dy[i].classList.remove('cur');
                dy[i].classList.remove('last');
                dy[i].classList.remove('next');
                dy[i].classList.add(dt[i].class);
                if (dt[i].today) {
                    dy[i].classList.remove('foldStatus');
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
            if (m === 12) {
                y++;
                m = 0;
            }
            if (m === -1) {
                y--;
                m = 11;
            }
            this.title.innerText = y + '-' + (m + 1) + '-' + d;
        },

        /**
         * 获取Temp中的日期信息：包括年、月、日
         */
        getTempDate: function () {
            this.year = this.yearTemp;
            this.month = this.monthTemp;
            this.day = this.dayTemp;
        },

        /**
         * 恢复Temp中的临时日期信息：包括年、月、日
         */
        getCertainDate: function () {
            this.yearTemp = this.year;
            this.monthTemp = this.month;
            this.dayTemp = this.day;
        },

        /**
         * 获取Title中的日期信息：包括年、月、日
         */
        getTitleInfo: function () {
            var _ymd = this.title.innerText.split('-');
            return {
                year: parseInt(_ymd[0]),
                month: parseInt(_ymd[1]),
                day: parseInt(_ymd[2])
            };
        },

        /**
         * 手指离开屏幕后执行一系列操作
         */
        afterTouch: function () {

            //月份面板的左右滑动
            if ((this.slideDir === 3 || this.slideDir === 4) && this.isSliding()) {
                this.swapEle();
                this.getTempDate();

                //获取当月日期数据
                this.getCurDays();

                //选择当前默认日期
                this.selectDefaultDay();

                this.weekIndexTemp = this.weekIndex;

                console.log(this.month, this.monthTemp, this.weekIndex);


                //重写标题日期
                this.rewriteTitle(this.year, this.monthTemp, this.day);

                //释放月份面板横向滑动动画锁
                this.afterSlideLock = false;
            } else {
                this.weekIndex = this.weekIndexTemp;
            }
            if (this.slideDir === 3 || this.slideDir === 4) {
                this.startAnimation(this.months, 'left', 0.2);
                this.slide();
            }

            //月份面板的展开收起
            if (this.slideDir === 1 || this.slideDir === 2) {
                this.startAnimation(this.calendarPanel, 'height', 0.2);
                this.startAnimation(this.months, 'top', 0.2);
                if (this.isSliding()) {
                    this.slideFoldOrUnfold();
                } else {
                    this.posRebound();
                }
            }

            //重置是否可以获取滑动方向的开关
            this.slideDirLock = false;

            //重置是否可以获取必要的日历数据开关
            this.getData = true;

            //恢复允许单个日期的点击
            setTimeout(function () {
                this.selectAllowed = true;
            }.bind(this), 10);
        },

        /**
         * 获取当月所有日期数据
         */
        getCurDays: function () {
            for (var i = 0; i < this.monthsLeft.length; i++) {
                if (this.monthsLeft[i].left === 0) {
                    this.curDays = this.monthsLeft[i].days;
                }
            }
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
            } else if (ele.length === undefined) {
                ele = [ele];
            }

            for (var i = 0; i < ele.length; i++) {
                ele[i].style.transition = _a + ' ' + _t + 's' + ' ' + _c;
            }
        },

        /**
         * 删除动画
         */
        removeAnimation: function (ele) {
            if (!ele) {
                return false;
            } else if (ele.length === undefined) {
                ele = [ele];
            }

            for (var i = 0; i < ele.length; i++) {
                ele[i].style.removeProperty('transition');

            }
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
                    if (this.slideDir === 1 && this.fold && this.calendarPanel.offsetHeight <= this.panelHeight.fold) {
                        return;
                    }
                    if (this.slideDir === 2 && !this.fold && this.calendarPanel.offsetHeight >= this.panelHeight.unfold) {
                        return;
                    }

                    //手指滑动平均速度超过阈值V
                    if (Math.abs(this.touchStartPos.pageY - this.touchEndPos.pageY) / (this.touchEndTime - this.touchStartTime) >= this.v) {
                        return true;
                    }

                    //面板滑动距离超过自身高度1/2
                    if (Math.abs(this.touchStartPos.pageY - this.touchEndPos.pageY) >= this.months[0].offsetHeight / 2) {
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
                    this.foldBox.style.backgroundImage = 'url("images/arrow_downward.png")';
                    for (var i = 0; i < this.months.length; i++) {
                        this.months[i].style.top = this.monthTop.fold + 'px';
                    }
                    break;
                case false:
                    this.calendarPanel.style.height = this.panelHeight.unfold + 'px';
                    this.foldBox.style.backgroundImage = 'url("images/arrow_upward.png")';
                    for (var j = 0; j < this.months.length; j++) {
                        this.months[j].style.top = this.monthTop.unfold + 'px';
                    }
                    break;
            }

            //防止怪异滑动行为造成的面板偏移，因此进行一次横向归位操作
            this.slide();
        },

        /**
         * 具体实现展开的函数
         */
        foldCalendar: function () {
            this.calendarPanel.style.height = this.panelHeight.unfold + 'px';
            this.foldBox.style.backgroundImage = 'url("images/arrow_upward.png")';
            for (var a = 0; a < this.months.length; a++) {
                this.months[a].style.top = this.monthTop.unfold + 'px';
            }
            for (var b = 0; b < this.days.length; b++) {
                this.days[b].classList.remove('foldStatus');
            }
            this.fold = false;

            //添加红点
            this.renderRedDot(this.redDotArrFn(), this.curDays);
        },

        /**
         * 具体实现展开的函数
         */
        unfoldCalendar: function () {
            this.calendarPanel.style.height = this.panelHeight.fold + 'px';
            this.foldBox.style.backgroundImage = 'url("images/arrow_downward.png")';
            for (var c = 0; c < this.months.length; c++) {
                this.months[c].style.top = this.monthTop.fold + 'px';
            }
            for (var d = 0; d < this.days.length; d++) {
                if (this.days[d].className.indexOf('today') === -1) {
                    this.days[d].classList.add('foldStatus');
                }
            }
            this.fold = true;

            //清除红点
            this.removeExisting();
        },

        /**
         * 实现日期面板点击按钮后的展开或收起
         */
        clickFoldOrUnfold: function () {
            this.startAnimation(this.calendarPanel, 'height', 0.2);
            this.startAnimation(this.months, 'top', 0.2);
            if (this.fold) {
                this.foldCalendar();
            } else {
                this.unfoldCalendar();
            }

            this.foldOrUnfoldCallback();
        },

        /**
         * 实现日期面板手指滑动时的展开或收起
         */
        slideFoldOrUnfold: function () {
            if (this.fold) {
                if (this.slideDir === 2) {
                    this.foldCalendar();
                }
            } else {
                if (this.slideDir === 1) {
                    this.unfoldCalendar();
                }
            }
            this.foldOrUnfoldCallback();
        },

        /**
         * 实现日期面板展开或收起时的回调
         */
        foldOrUnfoldCallback: function () {
            if (this.fold) {
                if (this.options.afterFold && this.options.afterFold instanceof Function) {
                    this.options.afterFold.bind(this)(this.getTitleInfo());
                }
            } else {
                if (this.options.afterUnfold && this.options.afterUnfold instanceof Function) {
                    this.options.afterUnfold.bind(this)(this.getTitleInfo());
                }
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
                    _li.setAttribute('data-row', w.toString());
                    for (var d = 0; d < 7; d++) {
                        _span = document.createElement('span');
                        _span.classList.add('day');
                        _span.innerText = d.toString();
                        _li.appendChild(_span);
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
                this.monthsLeftOrigin[w] = this.months[w].offsetLeft;
            }

            //设置当月初始日期数据
            this.curDays = this.monthsLeft[1].days;

            //设置monthsTop的初始值
            for (var a = 0; a < this.months[1].childNodes.length; a++) {
                this.monthsTop.push(a === 0 ? 0 : -this.months[1].childNodes[a].offsetHeight * a);
            }

            //设置日历面板展开和收起时的高度值
            this.panelHeight.fold = this.weeks[0].offsetHeight + this.foldBox.offsetHeight;
            this.panelHeight.unfold = this.months[0].offsetHeight + this.foldBox.offsetHeight;

            //根据盒子宽度设置每一天的间距
            var _w = Math.floor(((this.calendar.offsetWidth / 7) - this.weekNames[0].offsetWidth) / 2);
            for (var d = 0; d < this.days.length; d++) {
                this.days[d].style.margin = '0 ' + _w + 'px';
                if (d < this.weekNames.length) {
                    this.weekNames[d].style.margin = '0 ' + _w + 'px';
                }
            }
        },

        /**
         * 每次成功滑动月份面板则选择当月默认日期
         */
        selectDefaultDay: function () {
            var _selectedDay = null;

            for (var x = 0; x < this.days.length; x++) {
                this.days[x].classList.remove('selected');
            }
            for (var y = 0; y < this.weeks.length; y++) {
                this.weeks[y].classList.remove('curWeek');
            }
            if (this.fold) {
                _selectedDay = this.curDays[this.weekIndex * 7];
                _selectedDay.classList.add('selected');
                _selectedDay.parentNode.classList.add('curWeek');
                this.curWeek = _selectedDay.parentNode;
                this.day = this.dayTemp = this.curDays[this.weekIndex * 7].innerText;

                //在日历收起状态，则需要统一所有日期的显示样式（不区分上月，本月，下月）
                for (var d = 0; d < this.curDays.length; d++) {
                    if (this.curDays[d].className.indexOf('cur') === -1) {
                        this.curDays[d].classList.add('foldStatus');
                    }
                }

                //如果默认选择为上个月的日期，则当前标题月份显示需要-1
                if (_selectedDay.className.indexOf('last') !== -1) {
                    this.monthTemp--;
                }

                //如果默认选择为下个月的日期，则当前标题月份显示需要+1
                if (_selectedDay.className.indexOf('next') !== -1) {
                    this.monthTemp++;
                }
            } else {
                for (var b = 0; b < this.curDays.length; b++) {
                    if (this.curDays[b].innerText === '1') {
                        _selectedDay = this.curDays[b];
                        _selectedDay.classList.add('selected');
                        _selectedDay.parentNode.classList.add('curWeek');
                        this.curWeek = _selectedDay.parentNode;
                        break;
                    }
                }
            }
            this.updateMonthTop();
        },

        /**
         * 单个日期点击事件
         */
        selectDate: function (e) {
            var _curDay = e.target,
                _curWeek = _curDay.parentNode;

            //选择日期
            for (var i = 0; i < this.days.length; i++) {
                this.days[i].classList.remove('selected');
            }
            e.target.classList.add('selected');

            //给当前被选择元素所在的横行添加class
            for (var j = 0; j < this.weeks.length; j++) {
                this.weeks[j].classList.remove('curWeek');
            }
            _curWeek.classList.add('curWeek');
            this.curWeek = _curWeek;

            //更新月份面板在展开收起时的终值
            this.updateMonthTop();

            //修改weekIndex的值
            this.weekIndex = parseInt(_curWeek.getAttribute('data-row'));
            this.weekIndexTemp = this.weekIndex;

            //手动选择日期之后重写日期标题
            this.dayTemp = _curDay.innerText;
            if (_curDay.className.indexOf('cur') !== -1) {
                this.day = this.dayTemp;
                this.rewriteTitle(this.year, this.month, this.day);

                //设置this.curMonthFirstDay的值
                this.getCurMonthFirstDay(this.curDays);
            } else if (_curDay.className.indexOf('last') !== -1) {
                this.yearTemp = this.month + 1 === 1 ? this.year - 1 : this.year;
                this.monthTemp = this.month + 1 === 1 ? 11 : this.month - 1;
                this.rewriteTitle(this.yearTemp, this.monthTemp, this.dayTemp);
                this.yearTemp = this.year;
                this.monthTemp = this.month;

                //设置this.curMonthFirstDay的值
                this.getCurMonthFirstDay(this.curDays);
            } else if (_curDay.className.indexOf('next') !== -1) {
                this.yearTemp = this.month + 1 === 12 ? this.year + 1 : this.year;
                this.monthTemp = this.month + 1 === 12 ? 0 : this.month + 1;
                this.rewriteTitle(this.yearTemp, this.monthTemp, this.dayTemp);
                this.yearTemp = this.year;
                this.monthTemp = this.month;

                //设置this.curMonthLastDay的值
                this.getCurMonthLastDay(this.curDays);
            }

            //用户点击日期的回调
            if (this.options.afterSelect && this.options.afterSelect instanceof Function) {
                this.options.afterSelect.bind(this)(this.curDate = this.getTitleInfo());
            }
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
         * 更新月份面板展开收起时的top终值
         */
        updateMonthTop: function () {
            this.monthTop.fold = -this.curWeek.offsetTop === 0 ? 0 : -this.curWeek.offsetTop;
        },

        /**
         * 面板左右滑动动画结束之后
         */
        afterSlideHorizontal: function () {
            var _redDotArr = null;

            //滑到上个月之后的回调
            if (this.options.afterSlideToLast && this.slideDir === 4 && this.options.afterSlideToLast instanceof Function) {
                _redDotArr = this.redDotArrFn();
                this.options.afterSlideToLast.bind(this)();
            }

            //滑到下个月之后的回调
            if (this.options.afterSlideToNext && this.slideDir === 3 && this.options.afterSlideToNext instanceof Function) {
                _redDotArr = this.redDotArrFn();
                this.options.afterSlideToNext.bind(this)();
            }

            //在日历上渲染红点标记
            this.renderRedDot(_redDotArr, this.curDays);

            //重置滑动方向
            this.slideDir = 0;
        },

        /**
         * 在有计划的日期上添加红点标记
         */
        renderRedDot: function (arr, days) {

            //如果参数不满足要求则返回
            if ((!arr || !days) || (arr.length === 0 || days.length === 0)) {
                return;
            }

            if (this.fold) {
                return;
            }

            //将数组中的年份和月份去除
            arr = this.dataSimplification(arr);

            //再正式添加之前，先清除之前的红点
            this.removeExisting();

            //正式添加红点
            this.renderAllRedDots(arr, days);
        },

        /**
         * 渲染所需的红点标记
         */
        renderAllRedDots: function (arr, days) {
            var _arr = arr,
                _days = days;

            for (var i = 0; i < _arr.length; i++) {
                for (var j = 0; j < _days.length; j++) {
                    if (_arr[i] === _days[j].innerText && days[j].className.indexOf('cur') !== -1) {
                        _days[j].classList.add(this.mark);
                        this.redDotCarrier.push(_days[j]);
                        break;
                    }
                }

            }

        },

        /**
         * 修改后台红点数据
         */
        dataSimplification: function (arr) {
            var _res = [];
            for (var i = 0; i < arr.length; i++) {
                _res.push(parseInt(arr[i].split('-').pop()).toString());
            }
            return _res;
        },

        /**
         *
         */
        removeExisting: function () {
            for (var i = 0; i < this.redDotCarrier.length; i++) {
                this.redDotCarrier[i].classList.remove(this.mark);
            }
            this.redDotCarrier = [];
        },

        /**
         * 手动刷新红点
         */
        renderRedDotManually: function () {
            this.renderRedDot(this.redDotArrFn(), this.curDays);
        },

        /**
         * 获取日历当前应该展示的日期
         */
        getCurDate: function () {
            this.curDate.year = 2021;
            this.curDate.month = 12;
            this.curDate.day = 31;
        },

        /**
         * 设置日历当前应该展示的日期
         */
        setCurDate: function (d) {
            for (var i = 0; i < this.days1.length; i++) {
                if (parseInt(this.days1[i].innerText) === d && this.days1[i].className.indexOf('cur') !== -1) {
                    this.days1[i].classList.add('selected');
                    this.days1[i].parentNode.classList.add('curWeek');
                    this.curWeek = this.days1[i].parentNode;
                    this.weekIndex = Math.floor(i / 7);
                    this.weekIndexTemp = this.weekIndex;
                    this.updateMonthTop();
                    break;
                }
            }

            //每次刷新日历都需要重新设置一遍当前月份面板的第一个日期和最后一个日期
            this.getCurMonthFirstDay(this.curDays);
            this.getCurMonthLastDay(this.curDays);
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
                    if (i < _fisrtDay) { //设置上个月日期
                        _monthData[i].class = 'last';
                        _monthData[i].date = _lastMonthLastDay - _fisrtDay + i + 1;
                    }
                    if (i >= _fisrtDay + _monthDays) {
                        _monthData[i].class = 'next';
                        _monthData[i].date = i - (_fisrtDay + _monthDays - 1);
                    }
                }
            }

            return _monthData;
        };

        /**
         * 判断是否为闰年
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
         * 将用户配置参数与默认参数合并
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