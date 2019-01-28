const dotProp = require('dot-prop');
const EventEmitter = require('events');
const assert = require('assert');
const electron = require("electron");
const fs = require('fs-extra');
const path = require('path');
const mergeOptions = require('merge-options');

class Store{
	constructor(storeId, options = {}){
		this.storeId = storeId;
		
		this.filename = storeId+'.json';
		const defaultCwd = (electron.app || electron.remote.app).getPath('userData');
		this.cwd = (options.cwd) ? options.cwd : defaultCwd;
		this.filePath = path.resolve(this.cwd, this.filename);
		
		let defaultValues = (typeof options.defaults === 'object') ? Object.assign({}, options.defaults) : {};
		
		global[`memoryStore${storeId}`] = {
			data: defaultValues,
			emitter: new EventEmitter()
		};
		
		if (options.autoload){
			this.load(this.filePath, true);
		}
	}
	
	load(filePath = null, overwrite = false){
		let values = {};
		
		if (!filePath)
			filePath = this.filePath;
		
		if (fs.pathExistsSync(filePath)){
			let fileValues = fs.readJsonSync(filePath, { throws: false });
			if (fileValues)
				values = fileValues;
			
			if (overwrite){
				global[`memoryStore${this.storeId}`].data = values;
			}
			else{
				global[`memoryStore${this.storeId}`].data = mergeOptions({}, global[`memoryStore${this.storeId}`].data, values);
			}
		}
	}
	
	commit(options = {}){
		if (!options.filePath)
			options.filePath = this.filePath;
		
		if (options.except && Array.isArray(options.except)){
			for (let i = 0; i < options.except.length; i++){
				this.delete(options.except[i]);
			}
			
			fs.writeJsonSync(options.filePath, Object.assign({}, this.getAll()));
		}
		
		if (options.only && Array.isArray(options.only)){
			let onlyValues = {};
			
			for (let i = 0; i < options.only.length; i++){
				onlyValues[options.only[i]] = this.get(options.only[i]);
			}
			
			fs.writeJsonSync(options.filePath, Object.assign({},onlyValues));
		}
	}
	
	set(path, value){
		let res = super.set(global[`memoryStore${this.storeId}`].data, path, value);
		global[`memoryStore${this.storeId}`].emitter.emit('change');
		return res;
	}
	
	has(path){
		return super.has(global[`memoryStore${this.storeId}`].data, path);
	}
	
	get(path, value = undefined){
		return super.get(global[`memoryStore${this.storeId}`].data, path, value);
	}
	
	delete(path){
		return super.delete(global[`memoryStore${this.storeId}`].data, path);
	}
	
	getAll(){
		return global[`memoryStore${this.storeId}`].data;
	}
	
	onDidChange(key, callback) {
		if (typeof key !== 'string') {
			throw new TypeError(`Expected \`key\` to be of type \`string\`, got ${typeof key}`);
		}
		
		if (typeof callback !== 'function') {
			throw new TypeError(`Expected \`callback\` to be of type \`function\`, got ${typeof callback}`);
		}
		
		let currentValue = this.get(key);
		if (typeof currentValue === 'object')
			currentValue = Object.assign({}, currentValue);
		
		const onChange = () => {
			const oldValue = currentValue;
			const newValue = this.get(key);
			
			try {
				assert.deepStrictEqual(newValue, oldValue);
			} catch (_) {
				
				if (typeof newValue === 'object')
					currentValue = Object.assign({}, newValue);
				else
					currentValue = newValue;
				
				callback.call(this, newValue, oldValue);
			}
		};
		
		global[`memoryStore${this.storeId}`].emitter.on('change', onChange);
		return () => global[`memoryStore${this.storeId}`].emitter.removeListener('change', onChange);
	}
}

Object.setPrototypeOf(Store.prototype, dotProp);

module.exports = Store;