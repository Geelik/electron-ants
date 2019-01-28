# What ?
Electron-ants help you create worker's window to execute heavy tasks without frezzing your UI.

# Demo

1. clone this repository
2. npm install
3. npm run start

#Setup
- You need to have an [worker html file](/tests/example/worker/worker.html) used for the worker window 
and a [worker javascript file](tests/example/worker/worker.js) linked

- You need to call `Ant.Worker.init` in your main file (Entry point of your app)
```javascript
Ant.Worker.init(pathToYourWorkerHtmlFile, mainWindow);
//example pathToYourWorkerHtmlFile = `file://${global.__ROOT }/worker/index.html`;
//mainWindow is a reference to your renderer window from where you gonna call your workers
```

- You need to call `Ant.Worker.initTask` inside your worker javascript file
```javascript
Ant.Worker.initTask();
```

# How to use

Inside your renderer process
```javascript
Ant.Worker.create(yourTask, debug).then((worker) => {
    console.log(`"${yourTask}" is ready`);

    worker.onUpdate((payload) => {
        //Executed when sendUpdate is called
        console.log(`"${yourTask}" updated with this payload`, payload);
    });

    worker.onEnd((payload) => {
        //Executed when sendEnd or worker.stop is called
        console.log(`"${yourTask}" ended with this payload`, payload);
    });
    
    worker.onStop((payload) => {
        //Executed when worker.stop is called
        console.log(`"${yourTask}" stopped with this payload`, payload);
    });

    worker.onError((err) => {
        //Executed when sendError is called
        console.error(err);
    });

    worker.execute(params);
})
.catch(function(err){
    console.error(err);
});
```

- `yourTask` (strin) path of your task to execute, relative to the worker html file
- `debug` (boolean) if true show the worker window and open the devtools window too
- `params` (mixed) passed to your task's run method

# Tasks

Creating a task is very simple. Just create a javascript file
```javascript
export default class MyTask{
    constructor(workerId){
        //this.intervalDelay = 1000;
        //this.timeoutDelay = 1000;
    }

    run(params, sendUpdate, sendEnd, sendError){
        //Do what you want here
    }
    
    close(done){
        //Executed when the worker is stopped by an external call
        
        done(); //You need to call done for the worker to actually stop and close the window
    }
}
```
You can look in [tasks](/tests/example/worker/tasks) directory to have examples

## Different types of task

- Normal task

    Run is executed only once
    
- Interval task

    if `intervalDelay` is specified, run is executed inside a `setInterval`. 
    To stop the execution you have to call `sendEnd`
    
- Timeout task

    if `timeoutDelay` is specified, run is executed inside a `setTimeout`.
    After each `sendUpdate`'s call `setTimeout` is executed again.
    To stop the execution you have to call `sendEnd`
    
    
##Ant.Store

Store library inspired by [electron-store](https://github.com/sindresorhus/electron-store) but instead of saving in file it stay in memory

### How to use

```javascript
const defaultValues = {
    'foo': 'bar'
};

const myStore = new Ant.store('myStore', defaultValues);
```

Now `myStore` share the same API as [dot-prop](https://github.com/sindresorhus/dot-prop)

#License ![WTFPL](http://www.wtfpl.net/wp-content/uploads/2012/12/wtfpl-badge-4.png)

```
DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
```