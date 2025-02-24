# WRPC

TODO

- [ ] Add to readme https://stackoverflow.com/questions/77727664/how-to-get-returned-value-from-async-generator-when-using-for-await
- [ ] Value passed to next are ignored https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/next#sending_values_to_the_generator

```mermaid
sequenceDiagram
    box Main
    participant Code
    participant Caller
    end
    box Worker
    participant Worker
    participant Resolver
    end

    %% autonumber

    Code->>Caller: caller.generator(payload)

    Caller-->>Code: iterator & promise

    Code->>Code: Start main CONSUMER loop

    Code->>Caller: iterator[Symbol]()

    Caller->>Caller: Start replica GENERATOR loop

    Code->>Caller: iterator.next()

    Caller->>Worker: postMessage(payload)

    Worker->>Resolver: resolver(payload)

    Resolver-->>Worker: iterator

    Worker->>Worker: Start replica CONSUMER loop

    Worker->>Resolver: iterator[Symbol]()

    Resolver->>Resolver: Start GENERATOR loop

    rect rgb(232, 244, 248)

        loop Synchronized iteration
            Worker->>+Resolver: iterator.next(payload)

            Resolver-->>-Worker: yield value

            Worker-->>Caller: postMessage(value, done=false)

            Note over Worker: Wait for ACK or ABORT

            Caller-->>Code: yield value

            Code->>Caller: iterator.next(nextPayload)

            Caller->>Worker: postMessage(ack, nextPayload)
        end

    end

    break Break or AbortSignal (maybe)
        Code-->>Code: Loop exits
        Code->>Caller: signal.abort()

        Caller-->>Caller: Loop exits

        Caller->>Worker: postMessage(abort)

        Worker-->>Worker: Loop exits via Break

        Resolver-->>Resolver: Loop exits
    end

    opt Occurs on Error
        Resolver-->>Worker: throw Error

        Worker-->>Caller: postMessage(error, done=true)

        Caller-->>Code: throw Error
    end

    Resolver-->>Worker: return value

    Worker-->>Caller: postMessage(value, done=true)

    Caller-->>Code: return value
```
