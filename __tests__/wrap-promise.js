const wrapPromise = require('../wrap-promise');
const {noop} = require('./helpers');

describe('wrapPromise', () => {
  let testContext;

  beforeEach(() => {
    testContext = {};
  });

  it('returns a function', () => {
    const fn = wrapPromise(noop);

    expect(fn).toBeInstanceOf(Function);
  });

  describe('functions without callbacks', () => {
    it('invokes first parameter', () => {
      const returnValue = {foo: 'bar'};
      let fn;

      fn = wrapPromise(() => returnValue);

      expect(fn()).toBe(returnValue);
    });

    it('passes argument to first parameter', done => {
      let fn;
      const options = {
        foo: 'bar'
      };

      function dummy(data) {
        expect(data).toBe(options);

        done();
      }

      fn = wrapPromise(dummy);

      fn(options);
    });

    it('passes along many arguments to first parameter', done => {
      let fn;
      const firstArg = {
        foo: 'bar'
      };
      const secondArg = {
        bar: 'baz'
      };
      const thirdArg = {
        baz: 'buz'
      };

      function dummy(one, two, three) {
        expect(one).toBe(firstArg);
        expect(two).toBe(secondArg);
        expect(three).toBe(thirdArg);

        done();
      }

      fn = wrapPromise(dummy);

      fn(firstArg, secondArg, thirdArg);
    });
  });

  describe('last parameter is a callback', () => {
    it('does not pass callback to the first param function', () => {
      const promise = new Promise(noop);
      const dummy = jest.fn(() => promise);
      const fn = wrapPromise(dummy);
      const arg1 = {};
      const arg2 = {};

      fn(arg1, arg2, noop);

      expect(dummy).toBeCalledTimes(1);
      expect(dummy).toBeCalledWith(arg1, arg2);
    });

    it('calls the callback with resolved promise', done => {
      const data = {foo: 'bar'};
      const promise = Promise.resolve(data);
      const fn = wrapPromise(jest.fn(() => promise));

      fn({}, (err, resolvedData) => {
        expect(err).toBeFalsy();
        expect(resolvedData).toBe(data);

        done();
      });
    });

    it('calls the callback with rejected promise', done => {
      const error = new Error('An Error');
      const promise = Promise.reject(error);
      const fn = wrapPromise(jest.fn(() => promise));

      fn({}, (err, resolvedData) => {
        expect(resolvedData).toBeFalsy();
        expect(err).toBe(error);

        done();
      });
    });
  });

  describe('wrapPrototype', () => {
    let MyObject;

    beforeEach(() => {
      function CustomObject(value) {
        testContext.value = value;
      }

      CustomObject.prototype.myAsyncMethod = succeed => {
        if (succeed) {
          return Promise.resolve('yay');
        }

        return Promise.reject('boo');
      };

      CustomObject.prototype.mySecondAsyncMethod = succeed => {
        if (succeed) {
          return Promise.resolve('yay');
        }

        return Promise.reject('boo');
      };

      CustomObject.prototype.myAsyncMethodWithContext = () => Promise.resolve(testContext.value);

      CustomObject.myStaticMethod = succeed => {
        if (succeed) {
          return Promise.resolve('yay');
        }

        return Promise.reject('boo');
      };

      CustomObject.prototype.mySyncMethod = succeed => {
        if (succeed) {
          return 'yay';
        }

        return 'boo';
      };

      CustomObject.prototype._myPrivateMethod = () => Promise.resolve('yay');

      CustomObject.prototype.propertyOnPrototype = 'Not a function';

      MyObject = wrapPromise.wrapPrototype(CustomObject);
    });

    it('ignores static methods', () => {
      const returnValue = MyObject.myStaticMethod(true, noop);

      // if it had converted it, the return
      // value would be undefined
      expect(returnValue).toBeInstanceOf(Promise);
    });

    it('ignores sync methods', () => {
      const obj = new MyObject();
      const returnValue = obj.mySyncMethod(true);

      expect(returnValue).toBe('yay');
    });

    it('ignores non-methods on the prototype', () => {
      const obj = new MyObject();

      expect(obj.propertyOnPrototype).toBe('Not a function');
    });

    it('ignores private methods', () => {
      const obj = new MyObject();

      expect(obj._myPrivateMethod(noop)).toBeInstanceOf(Promise);
    });

    it('ignores the constructor', () => {
      const obj = new MyObject();

      expect(obj.constructor.toString()).toMatch(/^function CustomObject\(/);
    });

    it('can pass in an options object to ignore methods', () => {
      let obj;

      function MyOtherObject() {}

      MyOtherObject.prototype.transformMe = () => Promise.resolve('yay');
      MyOtherObject.prototype.ignoreMe = cb => {
        cb();

        return 'not a promise';
      };
      MyOtherObject.prototype.alsoIgnoreMe = cb => {
        cb();

        return 'also not a promise';
      };

      wrapPromise.wrapPrototype(MyOtherObject, {
        ignoreMethods: ['ignoreMe', 'alsoIgnoreMe']
      });

      obj = new MyOtherObject();

      expect(obj.transformMe(noop)).toBeUndefined();
      expect(() => {
        obj.ignoreMe(noop);
      }).not.toThrowError();
      expect(() => {
        obj.alsoIgnoreMe(noop);
      }).not.toThrowError();
    });

    it('can pass in an options object to include methods with leading underscores', done => {
      let obj;

      function MyOtherObject() {}

      MyOtherObject.prototype._doNotIgnoreMe = () => Promise.resolve('yay');

      wrapPromise.wrapPrototype(MyOtherObject, {
        transformPrivateMethods: true
      });

      obj = new MyOtherObject();

      obj._doNotIgnoreMe((err, res) => {
        expect(res).toBe('yay');
        done();
      });
    });

    describe('wraps each method on the prototype to use callbacks', () => {
      it('happy path', done => {
        const obj = new MyObject();
        let returnValue = 'not undefined';

        returnValue = obj.myAsyncMethod(true, (err, res) => {
          expect(returnValue).toBeUndefined();
          expect(err).toBeFalsy();
          expect(res).toBe('yay');
          done();
        });
      });

      it('sad path', done => {
        const obj = new MyObject();
        let returnValue = 'not undefined';

        returnValue = obj.myAsyncMethod(false, (err, res) => {
          expect(returnValue).toBeUndefined();
          expect(res).toBeFalsy();
          expect(err).toBe('boo');
          done();
        });
      });

      it('works on all protoypical methods', done => {
        const obj = new MyObject();
        let returnValue = 'not undefined';

        returnValue = obj.mySecondAsyncMethod(true, (err, res) => {
          expect(returnValue).toBeUndefined();
          expect(err).toBeFalsy();
          expect(res).toBe('yay');
          done();
        });
      });

      it('respects `this`', done => {
        const obj = new MyObject('foo');

        obj.myAsyncMethodWithContext((err, res) => {
          expect(res).toBe('foo');
          done();
        });
      });
    });

    describe('wraps each method on the prototype to and maintains promise behavior', () => {
      it('happy path', () => {
        const obj = new MyObject();
        const returnValue = obj.myAsyncMethod(true);

        expect(returnValue).toBeInstanceOf(Promise);

        return returnValue.then(res => {
          expect(res).toBe('yay');
        });
      });

      it('sad path', () => {
        const obj = new MyObject();
        const returnValue = obj.myAsyncMethod(false);

        expect(returnValue).toBeInstanceOf(Promise);

        return returnValue.then(() => {
          throw new Error('should not get here');
        }).catch(err => {
          expect(err).toBe('boo');
        });
      });

      it('works on all protoypical methods', () => {
        const obj = new MyObject();
        const returnValue = obj.mySecondAsyncMethod(true);

        expect(returnValue).toBeInstanceOf(Promise);

        return returnValue.then(res => {
          expect(res).toBe('yay');
        });
      });

      it('respects `this`', () => {
        const obj = new MyObject('foo');

        return obj.myAsyncMethodWithContext().then(res => {
          expect(res).toBe('foo');
        });
      });
    });
  });
});
