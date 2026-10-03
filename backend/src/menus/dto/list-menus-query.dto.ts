import { IsOptional, IsString, MaxLength } from 'class-validator'
import { ListQueryDto } from '../../common/list-query.dto'

export class ListMenusQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(50) category?: string
}
