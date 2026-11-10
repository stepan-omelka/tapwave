package dev.tapwave.gameplay;

import java.util.List;

/**
 * What the player did with one hit object. Which fields are used depends on the object type:
 * <ul>
 *     <li>circle: {@code offset} (ms, hit time minus object time) or {@code null} for a miss</li>
 *     <li>slider: {@code offset} of the head (or {@code null}) and {@code parts}, one flag per tick / repeat / tail</li>
 *     <li>spinner: {@code spins}, full rotations completed</li>
 * </ul>
 */
public record ObjectResult(Integer offset, List<Boolean> parts, Double spins) {
}
