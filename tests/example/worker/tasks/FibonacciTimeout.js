class FibonacciTimeout{
    constructor(){
        this.timeoutDelay = 1000;
        this.fib = [];
        this.index = 2;

        this.fib[0] = 0;
        this.fib[1] = 1;
    }

    run(params, sendUpdate, sendEnd, sendError){

        this.fib[this.index] = this.fib[this.index-2] + this.fib[this.index-1];
        sendUpdate(this.fib[this.index]);

        if (this.index === 10){
            sendEnd(this.fib);
        }

        this.index++;
    }
}

module.exports = FibonacciTimeout;