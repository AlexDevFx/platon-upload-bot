import {Injectable} from "@nestjs/common";

@Injectable()
export class DbStorageService {
    public insert(data: any): boolean {
        return true;
    }

    public find(id: string): any {
        return {};
    }

    public delete(id: string): boolean {
        return true;
    }
}