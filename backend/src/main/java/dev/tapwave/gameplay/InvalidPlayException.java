package dev.tapwave.gameplay;

/** The submitted play cannot have happened on this map (wrong shape, impossible timings, ...). */
public class InvalidPlayException extends RuntimeException {

    public InvalidPlayException(String message) {
        super(message);
    }
}
