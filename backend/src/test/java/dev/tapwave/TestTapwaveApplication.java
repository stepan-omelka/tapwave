package dev.tapwave;

import org.springframework.boot.SpringApplication;

public class TestTapwaveApplication {

	public static void main(String[] args) {
		SpringApplication.from(TapwaveApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
