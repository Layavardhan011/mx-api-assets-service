import { User } from "@libs/entities";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UserRepository {
  private users: User[] = [];

  create(user: User): Promise<User> {
    this.users.push(user);
    return Promise.resolve(user);
  }

  findAll(): Promise<User[]> {
    return Promise.resolve(this.users);
  }

  findOne(id: number): Promise<User | null> {
    return Promise.resolve(this.users.find(u => u.id === id) || null);
  }

  remove(id: number): Promise<void> {
    this.users = this.users.filter(u => u.id !== id);
    return Promise.resolve();
  }
}
