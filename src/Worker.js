const MemoryStore = require('./Store');
const path = require('path');

class AntWorker {
	/**
	 * Create new worker window. You never have to call it, @see Worker.create
	 * @process main
	 * @param taskFile | string | path to the task file, relative to Worker.workerMain html file
	 * @param debug | boolean | active worker debugging (ie show worker window and dev tool
	 */
	constructor(taskFile, debug) {
		
		if (AntWorker.isRenderer())
			throw new Error('AntWorker\'s instances should be created in the main process');
		
		this.id = AntWorker._generateId();
		this.window = null;
		this.debug = (debug && (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test'));
		this.stopped = false;
		
		this.onReadyCallback = null;
		this.onUpdateCallback = null;
		this.onPauseCallback = null;
		this.onResumeCallback = null;
		this.onStopCallback = null;
		this.onEndCallback = null;
		this.onErrorCallback = null;
		
		this.taskFile = taskFile;
		this.taskParams = {};
		this.taskInstance = null;
		
		this.interval = null;
		this.intervalCallback = null;
		
		AntWorker.getStatic('store').set(this.id, this);
		
		const BrowserWindow = require('electron').BrowserWindow;
		this.window = new BrowserWindow({
			show: this.debug
		});
		
		this.window.loadURL(AntWorker.getStatic('workerMain') + '?workerId=' + this.id);
		
		if (this.debug)
			this.window.openDevTools();
		
		this.window.webContents.on('did-finish-load', (evt) => {
			if (this.onReadyCallback && typeof this.onReadyCallback === 'function')
				this.onReadyCallback.call(this, evt);
		})
	}
	
	/**
	 * Define a callback for the onReady event
	 * @event fired when the worker window is ready
	 * @process main
	 * @param callback
	 */
	onReady(callback) {
		this.onReadyCallback = callback;
	}
	
	/**
	 * Define a callback for the onUpdate event
	 * @event fired when the worker send an update to the renderer
	 * @process main
	 * @param callback
	 */
	onUpdate(callback) {
		this.onUpdateCallback = callback;
	}
	
	/**
	 * Define a callback for the onPause event
	 * @event fired when the worker window is being paused (only used with interval workers)
	 * @process main
	 * @param callback
	 */
	onPause(callback) {
		this.onPauseCallback = callback;
	}
	
	/**
	 * Define a callback for the onResume event
	 * @event fired when the worker is resumed from his pause. Fire only if the worker is paused (only used with interval workers)
	 * @process main
	 * @param callback
	 */
	onResume(callback) {
		this.onResumeCallback = callback;
	}
	
	/**
	 * Define a callback for the onStop event
	 * @event fired when the worker is forced to stop
	 * @process main
	 * @param callback
	 */
	onStop(callback) {
		this.onStopCallback = callback;
	}
	
	/**
	 * Define a callback for the onEnd event
	 * @event fired when the worker has finished his task
	 * @process main
	 * @param callback
	 */
	onEnd(callback) {
		this.onEndCallback = callback;
	}
	
	onError(callback) {
		this.onErrorCallback = callback;
	}
	
	send(channel, payload) {
		if (!this.window.isDestroyed()) {
			this.window.webContents.send('electron-worker::message', {
				channel,
				payload
			});
		}
	}
	
	execute(params = {}) {
		this.taskParams = params;
		if (!this.window.isDestroyed())
			this.window.webContents.send('electron-worker::execute', this.taskParams);
	}
	
	executeInterval(taskInstance) {
		if (!this.window.isDestroyed() && this.intervalCallback && typeof this.intervalCallback === 'function')
			this.interval = setInterval(this.intervalCallback, taskInstance.intervalDelay);
	}
	
	clearInterval() {
		if (this.interval !== null) {
			this.interval.close();
			this.interval = null;
			return true;
		}
		
		return false;
	}
	
	pause() {
		if (!this.window.isDestroyed() && this.clearInterval() && this.onPauseCallback && typeof this.onPauseCallback === 'function')
			this.onPauseCallback.call(this);
	}
	
	resume() {
		if (!this.window.isDestroyed() && this.taskInstance.intervalDelay && Number.isInteger(this.taskInstance.intervalDelay) && this.taskInstance.intervalDelay > 0) {
			if (this.onResumeCallback && typeof this.onResumeCallback === 'function')
				this.onResumeCallback.call(this);
			
			this.executeInterval(this.taskInstance);
		}
		
	}
	
	stop() {
		if (this.stopped)
			return false;
		
		this.stopped = true;
		this.clearInterval();
		
		if (this.onStopCallback && typeof this.onStopCallback === 'function')
			this.onStopCallback.call(this);
		
		if (!this.window.isDestroyed() && !this.debug){
			this.window.webContents.send('electron-worker::close');
		}
		
		AntWorker.deleteFromStore(this.id);
	}
	
	static init(workerMain, rendererWindow) {
		if (AntWorker.isRenderer())
			throw new Error('AntWorker.init should be called in the main process');
		
		if (global['ElectronWorkerStatic'] && global['ElectronWorkerStatic'].isInit)
			return;
		
		global['ElectronWorkerStatic'] = {
			isInit: true,
			workerMain,
			rendererWindow,
			store: new MemoryStore('electronWorker')
		};
		
		rendererWindow.on('close', function () {
			AntWorker.stopAll();
		});
		
		//Register event sent from renderer for creating new worker
		const ipc = require('electron').ipcMain;
		
		ipc.on('electron-worker::create', function (evt, args) {
			
			//Create a new worker and wait for it to be ready then send his id to the caller
			let worker = new AntWorker(args.taskFile, args.debug);
			
			worker.window.on('closed', function () {
				worker.stop();
			});
			
			worker.onReady(function () {
				evt.sender.send('electron-worker::created', this.id);
			});
		});
		
		//When a worker send an update, propagate it to the renderer callback
		ipc.on('electron-worker::update', function (evt2, workerId, payload) {
			let worker = AntWorker.getFromID(workerId);
			
			if (worker && !worker.window.isDestroyed() && worker.onUpdateCallback && typeof worker.onUpdateCallback === 'function')
				worker.onUpdateCallback(payload);
		});
		
		//When a worker end, propagate it to the renderer callback
		ipc.on('electron-worker::end', function (evt2, workerId, payload) {
			let worker = AntWorker.getFromID(workerId);
			if (worker && !worker.window.isDestroyed()) {
				if (worker.onEndCallback && typeof worker.onEndCallback === 'function')
					worker.onEndCallback(payload);
				
				worker.stop();
			}
			
		});
		
		ipc.on('electron-worker::error', function (evt2, workerId, payload) {
			let worker = AntWorker.getFromID(workerId);
			
			if (worker && !worker.window.isDestroyed() && worker.onErrorCallback && typeof worker.onErrorCallback === 'function')
				worker.onErrorCallback(payload);
		});
	}
	
	/**
	 * @process worker renderer
	 */
	static initTask() {
		if (AntWorker.isMain())
			throw new Error('AntWorker.initTask should be called in the worker renderer process');
		
		let urlParameters = AntWorker.getUrlParameters(window.location);
		
		let workerId = urlParameters['workerId'] || null;
		if (!workerId)
			throw new Error('AntWorker.initTask couldn\'t find the workerId');
		
		let worker = AntWorker.getFromID(workerId);
		if (!worker)
			throw new Error('AntWorker.initTask couldn\'t find the worker');
		
		try {
			let cwd = path.dirname(AntWorker.getStatic('workerMain')).replace('file://', '');
			let Task = require(path.resolve(cwd, worker.taskFile));
			
			if (typeof Task !== 'function' && typeof Task.default === 'function')
				Task = Task.default;
			
			if (typeof Task !== 'function')
				throw new Error(`ElectronWorker.initTask : task's file "${worker.taskFile}" is not returning a function or a class by default`);
			
			const ipc = require('electron').ipcRenderer;
			
			let taskInstance = new Task(worker.id);
			worker.taskInstance = taskInstance;
			
			const done = function () {
				worker.window.close();
			};
			
			ipc.on('electron-worker::message', (evt, messageInfos) => {
				if (!worker.window.isDestroyed() && taskInstance.onMessage && typeof taskInstance.onMessage === 'function') {
					taskInstance.onMessage(messageInfos.channel, messageInfos.payload);
				}
			});
			
			ipc.on('electron-worker::close', (evt) => {
				console.log('closed recieved');
				if (!worker.window.isDestroyed()) {
					if (taskInstance.close && typeof taskInstance.close === 'function')
						taskInstance.close(done);
					else{
						done();
					}
				}
			});
			
			ipc.on('electron-worker::execute', (evt, taskParams) => {
				if (!worker.window.isDestroyed()) {
					//If the task need to be run multiple times
					if (taskInstance.intervalDelay && Number.isInteger(taskInstance.intervalDelay) && taskInstance.intervalDelay > 0) {
						AntWorker.runIntervalTask(worker, taskParams, taskInstance);
					}
					else if (taskInstance.timeoutDelay && Number.isInteger(taskInstance.timeoutDelay) && taskInstance.timeoutDelay > 0) {
						AntWorker.runTimeoutTask(worker, taskParams, taskInstance);
					}
					//if the task need to be executed only once
					else {
						AntWorker.runNormalTask(worker, taskParams, taskInstance);
					}
				}
			});
		}
		catch (err) {
			throw err;
		}
	}
	
	static runNormalTask(worker, taskParams, taskInstance) {
		const ipc = require('electron').ipcRenderer;
		
		const sendEnd = function (payload) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::end', worker.id, payload);
			}
		};
		
		const sendUpdate = function (payload) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::update', worker.id, payload);
			}
		};
		
		const sendError = function (payload, callEnd = false) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::error', worker.id, payload);
				if (callEnd)
					sendEnd();
			}
		};
		
		taskInstance.run(taskParams, sendUpdate, sendEnd, sendError);
	}
	
	static runIntervalTask(worker, taskParams, taskInstance) {
		const ipc = require('electron').ipcRenderer;
		
		const sendEnd = function (payload) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::end', worker.id, payload);
			}
		};
		
		const sendUpdate = function (payload) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::update', worker.id, payload);
			}
		};
		
		const sendError = function (payload, callEnd = false) {
			if (!worker.window.isDestroyed()) {
				
				ipc.send('electron-worker::error', worker.id, payload);
				if (callEnd)
					sendEnd();
			}
		};
		
		worker.intervalCallback = () => {
			if (!worker.window.isDestroyed()) {
				taskInstance.run(taskParams, sendUpdate, sendEnd, sendError);
			}
		};
		if (!worker.window.isDestroyed()) {
			worker.executeInterval(taskInstance);
		}
	}
	
	static runTimeoutTask(worker, taskParams, taskInstance) {
		const ipc = require('electron').ipcRenderer;
		const sendUpdate = function (payload) {
			if (!worker.window.isDestroyed()) {
				setTimeout(function () {
					taskInstance.run(taskParams, sendUpdate, sendEnd);
				}, taskInstance.timeoutDelay);
				ipc.send('electron-worker::update', worker.id, payload);
			}
		};
		
		const sendEnd = function (payload) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::end', worker.id, payload);
			}
		};
		
		const sendError = function (payload, callEnd = false) {
			if (!worker.window.isDestroyed()) {
				ipc.send('electron-worker::error', worker.id, payload);
				if (callEnd)
					sendEnd();
			}
		};
		
		taskInstance.run(taskParams, sendUpdate, sendEnd, sendError);
	}
	
	static create(taskFile, debug) {
		
		return new Promise(function (resolve, reject) {
			if (!AntWorker.getStatic('isInit'))
				reject(new Error('AntWorker is not initialized, please call AntWorker.init inside main process before creating workers'));
			
			if (AntWorker.isMain())
				reject(new Error('AntWorker.create should be called in the renderer process'));
			
			//Send event to main process to create a new worker
			const ipc = require('electron').ipcRenderer;
			
			ipc.send('electron-worker::create', {
				taskFile,
				debug
			});
			
			//When worker ready resolve promise with it has a parameter
			ipc.on('electron-worker::created', function (evt, workerId) {
				resolve(AntWorker.getFromID(workerId));
			});
			
			
		})
	}
	
	//Utility part
	static isMain() {
		return process.type === 'browser';
	}
	
	static isRenderer() {
		return !AntWorker.isMain();
	}
	
	static getStatic(key) {
		
		if (AntWorker.isMain())
			return global['ElectronWorkerStatic'][key] || undefined;
		else
			return require('electron').remote.getGlobal('ElectronWorkerStatic')[key] || undefined;
	}
	
	static getFromID(workerId) {
		return AntWorker.getStatic('store').get(workerId);
	}
	
	static deleteFromStore(workerId) {
		AntWorker.getStatic('store').delete(workerId);
	}
	
	static stopAll() {
		let workerStore = AntWorker.getStatic('store').getAll();
		for (let workerId in workerStore) {
			let worker = workerStore[workerId];
			worker.stop();
		}
	}
	
	static _generateId() {
		let id = "" + Date.now() + Math.random();
		return id.replace('.', '');
	}
	
	static getUrlParameters(locationString) {
		let searchString = locationString.search.substring(1),
			i, val, params = searchString.split("&");
		
		let urlParameters = {};
		
		for (i = 0; i < params.length; i++) {
			val = params[i].split("=");
			urlParameters[val[0]] = (val[1]) ? val[1] : null
		}
		
		return urlParameters;
	}
}

module.exports = AntWorker;