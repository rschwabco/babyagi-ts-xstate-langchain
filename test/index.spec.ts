// tslint:disable: only-arrow-functions
import { expect } from 'chai';
import { main } from '../src';

describe('Index module', function() {
  describe('expected behavior', function() {
    it('should return hello world', function() {
      expect(main()).to.equal('Hello World');
    });
  });
});
